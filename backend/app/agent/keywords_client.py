"""
Keywords AI Client - Multimodal Scene Understanding
Handles LLM calls through Keywords AI for rich, contextual scene descriptions.

Key design changes:
- Uses multimodal vision model with actual image input
- Generates holistic scene narratives, not alert-style callouts
- Detection output is optional context, not the primary input
"""

import time
import base64
import logging
from typing import Dict, List, Optional, Any
import httpx

from app.config import get_settings
from app.models import Detection, TrackedObject


logger = logging.getLogger(__name__)


# System prompt for high-fidelity scene narration
SCENE_NARRATOR_PROMPT = """You are an assistive vision narrator helping a blind or low-vision user understand their surroundings.

Your role is to provide RICH, CONTEXTUAL scene descriptions that paint a complete picture of the environment.

Description requirements:
1. ENVIRONMENTAL CONTEXT: Identify the type of space (hallway, room, outdoor street, store, kitchen, office, etc.)
2. SPATIAL RELATIONSHIPS: Describe where objects are relative to each other and the viewer (left, right, center, near, far, ahead)
3. OBJECT POSITIONS: Use clear directional language ("A table sits in the center with chairs around it")
4. PEOPLE AND ACTIONS: When visible, describe posture, facing direction, and apparent activity
5. NAVIGATION CUES: Mention doorways, paths, openings, or obstacles that affect movement

Style guidelines:
- Write in 2-4 complete sentences
- Be specific and spatial ("Two people stand near the doorway on the right")
- Avoid single-object callouts ("There is a person" - TOO SIMPLE)
- Create a mental map the user can navigate by
- Use natural, conversational language
- Focus on what's most relevant for orientation and understanding

DISALLOWED:
- Single object announcements
- Alert-style warnings ("Careful!", "Watch out!")
- Lists of objects without spatial context
- Technical jargon

Example good output:
"You are in a hallway with beige walls. Two people are walking toward you from ahead, about ten feet away. A doorway opens to your right, and there's a potted plant beside it. The hallway continues forward."

Example bad output:
"Person detected. Chair on left. Door visible."

Describe what you SEE in the image provided."""


class KeywordsAIClient:
    """
    Client for Keywords AI API with multimodal vision support.
    
    Handles:
    - Image-based scene understanding with Claude vision
    - Rich, contextual narration generation
    - Trace logging for transparency
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
            timeout=60.0  # Increased for vision models
        )
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
    
    def _format_detections_context(self, objects: List[TrackedObject]) -> str:
        """Format tracked objects as optional context (not primary input)."""
        if not objects:
            return ""
        
        lines = ["Detected objects for context:"]
        for obj in objects[:10]:  # Limit to top 10
            cx = obj.bbox.center_x
            position = "left" if cx < 0.35 else ("right" if cx > 0.65 else "center")
            area = obj.bbox.area
            distance = "close" if area > 0.15 else ("nearby" if area > 0.05 else "distant")
            lines.append(f"- {obj.label}: {distance}, {position}")
        
        return "\n".join(lines)
    
    async def generate_scene_description(
        self,
        image_base64: str,
        objects: Optional[List[TrackedObject]] = None,
        ocr_text: Optional[str] = None
    ) -> tuple[str, float, Dict[str, Any]]:
        """
        Generate a rich scene description using multimodal vision.
        
        Args:
            image_base64: Base64 encoded image (with or without data URL prefix)
            objects: Optional list of detected objects for context
            ocr_text: Optional OCR text found in scene
            
        Returns:
            Tuple of (description, inference_time_ms, trace)
        """
        start = time.time()
        
        # Prepare image in OpenAI format (Keywords AI expects OpenAI format)
        if "," in image_base64:
            # Already has data URL prefix
            if not image_base64.startswith("data:"):
                # Malformed, extract just the base64 part
                image_base64 = image_base64.split(",")[1]
                image_url = f"data:image/jpeg;base64,{image_base64}"
            else:
                image_url = image_base64
        else:
            # Plain base64, add data URL prefix
            image_url = f"data:image/jpeg;base64,{image_base64}"
        
        # Build the user message in OpenAI format
        # Start with text prompt
        text_parts = ["Describe this scene for a blind user. Provide rich spatial context and environmental understanding."]
        
        # Add detection context if available (but it doesn't dominate)
        if objects:
            context = self._format_detections_context(objects)
            if context:
                text_parts.append(f"\n\n{context}\n\nUse these detections as supplementary context only. Focus on what you SEE in the image.")
        
        if ocr_text:
            text_parts.append(f"\n\nVisible text in scene: {ocr_text}")
        
        # OpenAI format: text first, then image
        user_content = [
            {
                "type": "text",
                "text": "\n".join(text_parts)
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": image_url
                }
            }
        ]
        
        # Keywords AI request payload with Claude Sonnet for vision
        payload = {
            "model": "claude-sonnet-4-20250514",  # Use Sonnet for better vision
            "messages": [
                {"role": "system", "content": SCENE_NARRATOR_PROMPT},
                {"role": "user", "content": user_content}
            ],
            "max_tokens": 300,
            "temperature": 0.4,
            # Keywords AI specific fields
            "customer_identifier": "aeye-demo",
            "metadata": {
                "feature": "multimodal_scene_description",
                "has_objects": objects is not None,
                "has_ocr": ocr_text is not None
            }
        }
        
        trace = {
            "request": {
                "model": payload["model"],
                "object_count": len(objects) if objects else 0,
                "has_ocr": ocr_text is not None,
                "has_image": True
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
            
            logger.info(f"Multimodal scene description generated in {inference_time:.1f}ms")
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
    
    async def generate_text_narration(
        self,
        image_base64: str,
        ocr_text: str
    ) -> tuple[str, float, Dict[str, Any]]:
        """
        Generate a narration for detected text, using vision to provide context.
        
        Args:
            image_base64: Base64 encoded image
            ocr_text: Raw OCR text detected
            
        Returns:
            Tuple of (narration, inference_time_ms, trace)
        """
        start = time.time()
        
        # Prepare image in OpenAI format
        if "," in image_base64:
            if not image_base64.startswith("data:"):
                image_base64 = image_base64.split(",")[1]
                image_url = f"data:image/jpeg;base64,{image_base64}"
            else:
                image_url = image_base64
        else:
            image_url = f"data:image/jpeg;base64,{image_base64}"
        
        text_prompt = f"""The following text was detected in this image:
"{ocr_text}"

Read this text naturally for a blind user. If it's a sign, menu, or label, explain what it says and what it might be (e.g., "This appears to be a menu board listing..." or "This sign says...").
Keep it natural and informative, as if you're reading aloud to someone."""
        
        payload = {
            "model": "claude-sonnet-4-20250514",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": text_prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": image_url
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 200,
            "temperature": 0.3,
            "customer_identifier": "aeye-demo",
            "metadata": {"feature": "text_narration"}
        }
        
        trace = {"request": {"model": payload["model"], "has_image": True}}
        
        try:
            response = await self.client.post("/chat/completions", json=payload)
            response.raise_for_status()
            result = response.json()
            
            narration = result["choices"][0]["message"]["content"]
            inference_time = (time.time() - start) * 1000
            
            trace["response"] = {"success": True, "inference_ms": inference_time}
            return narration.strip(), inference_time, trace
            
        except Exception as e:
            inference_time = (time.time() - start) * 1000
            logger.error(f"Text narration error: {e}")
            trace["response"] = {"success": False, "error": str(e)}
            
            # Fallback: just return the raw OCR text
            return f"The text reads: {ocr_text}", inference_time, trace
    
    def _fallback_description(self, objects: Optional[List[TrackedObject]]) -> str:
        """Generate a simple fallback description when API fails."""
        if not objects:
            return "I'm having trouble connecting to the vision service. The area appears to have some activity."
        
        # Group by type and position
        left = []
        center = []
        right = []
        
        for obj in objects:
            cx = obj.bbox.center_x
            if cx < 0.35:
                left.append(obj.label)
            elif cx > 0.65:
                right.append(obj.label)
            else:
                center.append(obj.label)
        
        parts = []
        if center:
            parts.append(f"Ahead: {', '.join(set(center))}")
        if left:
            parts.append(f"On your left: {', '.join(set(left))}")
        if right:
            parts.append(f"On your right: {', '.join(set(right))}")
        
        if parts:
            return ". ".join(parts) + "."
        return "The area appears clear."


# Singleton instance
_keywords_client: Optional[KeywordsAIClient] = None


def get_keywords_client() -> KeywordsAIClient:
    """Get the singleton Keywords AI client instance."""
    global _keywords_client
    if _keywords_client is None:
        _keywords_client = KeywordsAIClient()
    return _keywords_client
