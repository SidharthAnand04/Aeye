"""
Keywords AI Client - Agent Orchestration and Tracing
Handles LLM calls through Keywords AI for scene description and reasoning.
"""

import time
import logging
from typing import Dict, List, Optional, Any
import httpx

from app.config import get_settings
from app.models import Detection, TrackedObject


logger = logging.getLogger(__name__)


# Tool schemas for Keywords AI
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "speak_alert",
            "description": "Speak an urgent alert to the user about an obstacle or hazard",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Short alert message to speak (max 10 words)"
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                        "description": "Alert priority level"
                    }
                },
                "required": ["message", "priority"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "describe_scene",
            "description": "Provide a brief scene description for the user",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "Concise spatial scene description (max 30 words)"
                    }
                },
                "required": ["description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_text",
            "description": "Read detected text aloud to the user",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "The text to read"
                    }
                },
                "required": ["text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "give_direction",
            "description": "Give directional guidance to the user",
            "parameters": {
                "type": "object",
                "properties": {
                    "direction": {
                        "type": "string",
                        "enum": ["left", "right", "forward", "stop", "turn around"],
                        "description": "Direction to guide the user"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief reason for the direction"
                    }
                },
                "required": ["direction"]
            }
        }
    }
]


# System prompt for the assistive vision agent
AGENT_SYSTEM_PROMPT = """You are an assistive vision AI helping a blind or low-vision user navigate their environment safely.

Your role:
1. Analyze object detections from the user's camera
2. Identify potential hazards or obstacles
3. Provide brief, clear audio alerts when needed
4. Describe scenes on request
5. Help the user navigate safely

Guidelines:
- Be CONCISE: alerts should be 3-8 words
- Use spatial terms: "ahead", "left", "right", "close", "approaching"
- Prioritize moving objects and close obstacles
- Don't over-alert: only speak when necessary
- For scene descriptions, summarize spatially in 1-2 sentences

Object priority (high to low):
1. Moving obstacles in path (person, bike, car approaching)
2. Close stationary obstacles (chair, door in path)
3. Background objects (not blocking path)

Position reference:
- x < 0.35 = left side
- x 0.35-0.65 = center/ahead
- x > 0.65 = right side
- Large bbox area (>0.15) = close
- Very large area (>0.30) = very close"""


class KeywordsAIClient:
    """
    Client for Keywords AI API.
    
    Handles:
    - LLM calls via Keywords AI proxy
    - Tool calling for agent actions
    - Trace logging for transparency
    
    Uses Claude Haiku for fast inference (~200-400ms)
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.keywords_ai_base_url
        self.api_key = self.settings.keywords_ai_api_key
        
        # HTTP client with connection pooling
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            },
            timeout=30.0
        )
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
    
    def _format_detections(self, objects: List[TrackedObject]) -> str:
        """Format tracked objects into a prompt-friendly string."""
        if not objects:
            return "No objects detected."
        
        lines = []
        for obj in objects:
            # Determine position
            cx = obj.bbox.center_x
            if cx < 0.35:
                position = "left"
            elif cx > 0.65:
                position = "right"
            else:
                position = "ahead"
            
            # Determine distance
            area = obj.bbox.area
            if area > 0.30:
                distance = "very close"
            elif area > 0.15:
                distance = "close"
            elif area > 0.05:
                distance = "nearby"
            else:
                distance = "distant"
            
            # Motion
            motion = ""
            if obj.is_approaching:
                motion = ", approaching"
            elif abs(obj.velocity_x) > 0.05:
                motion = ", moving " + ("right" if obj.velocity_x > 0 else "left")
            
            lines.append(f"- {obj.label} ({distance}, {position}{motion})")
        
        return "\n".join(lines)
    
    async def generate_scene_description(
        self,
        objects: List[TrackedObject],
        ocr_text: Optional[str] = None
    ) -> tuple[str, float, Dict[str, Any]]:
        """
        Generate a scene description using Claude Haiku via Keywords AI.
        
        Returns:
            Tuple of (description, inference_time_ms, trace)
        """
        start = time.time()
        
        # Build the user message
        detection_text = self._format_detections(objects)
        user_message = f"""Describe the current scene for a blind user based on these detections:

{detection_text}
"""
        if ocr_text:
            user_message += f"\nVisible text: {ocr_text}"
        
        user_message += "\n\nProvide a brief (1-2 sentence) spatial description of what's in view."
        
        # Keywords AI request payload
        payload = {
            "model": "claude-3-5-haiku-20241022",
            "messages": [
                {"role": "system", "content": AGENT_SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ],
            "max_tokens": 150,
            "temperature": 0.3,
            # Keywords AI specific fields
            "customer_identifier": "aeye-demo",
            "metadata": {
                "feature": "scene_description",
                "object_count": len(objects)
            }
        }
        
        trace = {
            "request": {
                "model": payload["model"],
                "object_count": len(objects),
                "has_ocr": ocr_text is not None
            }
        }
        
        try:
            response = await self.client.post(
                "/chat/completions",
                json=payload
            )
            response.raise_for_status()
            
            result = response.json()
            
            description = result["choices"][0]["message"]["content"]
            
            inference_time = (time.time() - start) * 1000
            
            trace["response"] = {
                "success": True,
                "tokens_used": result.get("usage", {}),
                "inference_ms": inference_time
            }
            
            logger.info(f"Scene description generated in {inference_time:.1f}ms")
            return description.strip(), inference_time, trace
            
        except Exception as e:
            inference_time = (time.time() - start) * 1000
            logger.error(f"Keywords AI error: {e}")
            trace["response"] = {
                "success": False,
                "error": str(e),
                "inference_ms": inference_time
            }
            
            # Fallback to rule-based description
            fallback = self._fallback_description(objects)
            return fallback, inference_time, trace
    
    async def get_agent_decision(
        self,
        objects: List[TrackedObject],
        context: Dict[str, Any]
    ) -> tuple[Optional[str], Dict[str, Any]]:
        """
        Get agent decision with tool calling.
        
        This uses Keywords AI to decide what action to take based on
        the current detections and context.
        
        Returns:
            Tuple of (action message or None, trace)
        """
        start = time.time()
        
        detection_text = self._format_detections(objects)
        
        user_message = f"""Current detections:
{detection_text}

Context:
- Last alert: {context.get('last_alert_ago', 'never')} seconds ago
- Mode: {context.get('mode', 'live_assist')}

Decide if an alert is needed. If yes, use speak_alert tool. If no, respond with "No alert needed."
"""
        
        payload = {
            "model": "claude-3-5-haiku-20241022",
            "messages": [
                {"role": "system", "content": AGENT_SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ],
            "tools": TOOL_SCHEMAS,
            "tool_choice": "auto",
            "max_tokens": 100,
            "temperature": 0.1,
            "customer_identifier": "aeye-demo",
            "metadata": {
                "feature": "agent_decision",
                "object_count": len(objects)
            }
        }
        
        trace = {
            "request": {
                "model": payload["model"],
                "object_count": len(objects),
                "context": context
            }
        }
        
        try:
            response = await self.client.post(
                "/chat/completions",
                json=payload
            )
            response.raise_for_status()
            
            result = response.json()
            message = result["choices"][0]["message"]
            
            inference_time = (time.time() - start) * 1000
            
            trace["response"] = {
                "success": True,
                "tokens_used": result.get("usage", {}),
                "inference_ms": inference_time
            }
            
            # Check for tool calls
            if "tool_calls" in message and message["tool_calls"]:
                tool_call = message["tool_calls"][0]
                function = tool_call["function"]
                
                trace["tool_call"] = {
                    "name": function["name"],
                    "arguments": function["arguments"]
                }
                
                import json
                args = json.loads(function["arguments"])
                
                if function["name"] == "speak_alert":
                    return args.get("message"), trace
                elif function["name"] == "describe_scene":
                    return args.get("description"), trace
                elif function["name"] == "give_direction":
                    direction = args.get("direction", "")
                    reason = args.get("reason", "")
                    return f"{direction}. {reason}".strip(), trace
            
            # No tool call = no alert needed
            return None, trace
            
        except Exception as e:
            inference_time = (time.time() - start) * 1000
            logger.error(f"Keywords AI error: {e}")
            trace["response"] = {
                "success": False,
                "error": str(e),
                "inference_ms": inference_time
            }
            return None, trace
    
    def _fallback_description(self, objects: List[TrackedObject]) -> str:
        """Generate a simple fallback description when API fails."""
        if not objects:
            return "The area appears clear."
        
        # Count by type
        counts = {}
        for obj in objects:
            counts[obj.label] = counts.get(obj.label, 0) + 1
        
        # Build description
        parts = []
        for label, count in counts.items():
            if count == 1:
                parts.append(f"one {label}")
            else:
                parts.append(f"{count} {label}s")
        
        return f"I can see {', '.join(parts)}."


# Singleton instance
_keywords_client: Optional[KeywordsAIClient] = None


def get_keywords_client() -> KeywordsAIClient:
    """Get the singleton Keywords AI client instance."""
    global _keywords_client
    if _keywords_client is None:
        _keywords_client = KeywordsAIClient()
    return _keywords_client
