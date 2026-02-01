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

model_name = "anthropic/claude-3-5-haiku-latest"
logger = logging.getLogger(__name__)


# System prompt for navigation and scene understanding
SCENE_NARRATOR_PROMPT = """
You are a NAVIGATION COMMANDER.
Your ONLY job is to issue a SINGLE MOVEMENT COMMAND to a blind user.

STRICT RULES:
OUTPUT ONLY 5-9 WORDS.
DO NOT LIST OBJECTS (e.g. "Chair left, table right").
DO NOT DESCRIBE THE SCENE.
FOCUS ON THE PATH.

CORRECT OUTPUT FORMAT:
[OBSTACLE] [POSITION]. [ACTION].

EXAMPLES:
Input: (Image of a hallway with a chair on the left)
Output: Chair on left. Walk straight ahead.

Input: (Image of a blocked path)
Output: Box blocking path. Go around right.

Input: (Image of a clear street)
Output: Path clear. Continue walking forward.

BAD EXAMPLES (NEVER DO THIS):
"There is a chair on the left and a table on the right." (TOO LONG, NO ACTION)
"Chair left, table right, door ahead." (LISTING OBJECTS IS BANNED)
"I see a clear path ahead of you." (CHATTY)

Remember: You are a COMMANDER. Give an ORDER.
"""

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
        
        # Keywords AI request payload with Claude Haiku for fast vision
        payload = {
            "model": model_name,
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
            "model": model_name,
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
    
    async def generate_detailed_scene_description(
        self,
        image_base64: str,
        ocr_text: Optional[str] = None,
        objects: Optional[List[TrackedObject]] = None
    ) -> tuple[str, float, Dict[str, Any]]:
        """
        Generate a comprehensive, detailed scene description with OCR text.
        
        This provides much more information than the navigation-focused descriptions:
        - Full environmental description
        - All visible text from signs, labels, screens
        - Object locations and relationships
        - Spatial layout and context
        - Detailed information for understanding the complete scene
        
        Args:
            image_base64: Base64 encoded image
            ocr_text: Optional OCR text detected from the scene
            objects: Optional list of detected objects
            
        Returns:
            Tuple of (detailed_description, inference_time_ms, trace)
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
        
        # Build detailed prompt - concise but comprehensive
        prompt_parts = [
            "Describe this scene for a blind person in UNDER 50 WORDS.",
            "",
            "FORMAT: Direct, factual statements. No filler words.",
            "",
            "INCLUDE:",
            "1. Environment type (indoor/outdoor, what kind of space)",
            "2. Key objects and their locations (left/right/center/ahead)",
            "3. Any visible TEXT from signs, labels, screens",
            "4. People and what they're doing",
            "5. Important spatial details",
            "",
            "STYLE: Clear, concise, actionable. Like navigation guidance but more complete."
        ]
        
        if ocr_text:
            prompt_parts.extend([
                "",
                f"TEXT IN SCENE: {ocr_text}",
                "State what the text says and where it appears."
            ])
        
        if objects and len(objects) > 0:
            obj_summary = ", ".join([f"{obj.label}" for obj in objects[:10]])
            prompt_parts.extend([
                "",
                f"DETECTED: {obj_summary}",
                "Mention key objects with positions."
            ])
        
        prompt_parts.append("")
        prompt_parts.append("Keep under 80 words. Be specific and direct.")
        
        detailed_prompt = "\n".join(prompt_parts)
        
        user_content = [
            {"type": "text", "text": detailed_prompt},
            {
                "type": "image_url",
                "image_url": {
                    "url": image_url
                }
            }
        ]
        
        # Keywords AI request payload
        payload = {
            "model": model_name,
            "messages": [
                {"role": "user", "content": user_content}
            ],
            "max_tokens": 200,  # Shorter response for concise descriptions
            "temperature": 0.4,
            "customer_identifier": "aeye-demo",
            "metadata": {
                "feature": "detailed_scene_description",
                "has_objects": objects is not None,
                "has_ocr": ocr_text is not None
            }
        }
        
        trace = {
            "request": {
                "model": payload["model"],
                "object_count": len(objects) if objects else 0,
                "has_ocr": ocr_text is not None,
                "has_image": True,
                "max_tokens": 200
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
            
            logger.info(f"Detailed scene description generated in {inference_time:.1f}ms")
            return description.strip(), inference_time, trace
            
        except Exception as e:
            inference_time = (time.time() - start) * 1000
            logger.error(f"Keywords AI detailed description error: {e}")
            trace["response"] = {
                "success": False,
                "error": str(e),
                "inference_ms": inference_time
            }
            
            # Fallback to simpler description
            fallback = self._fallback_detailed_description(objects, ocr_text)
            return fallback, inference_time, trace
    
    def _fallback_detailed_description(
        self, 
        objects: Optional[List[TrackedObject]], 
        ocr_text: Optional[str]
    ) -> str:
        """Generate a fallback detailed description when API fails."""
        parts = []
        
        if ocr_text:
            parts.append(f"Text visible in the scene: {ocr_text}")
        
        if objects and len(objects) > 0:
            obj_list = ", ".join([obj.label for obj in objects])
            parts.append(f"Objects detected: {obj_list}")
            
            # Group by position
            left = [obj.label for obj in objects if obj.bbox.center_x < 0.35]
            center = [obj.label for obj in objects if 0.35 <= obj.bbox.center_x <= 0.65]
            right = [obj.label for obj in objects if obj.bbox.center_x > 0.65]
            
            if center:
                parts.append(f"Center: {', '.join(set(center))}")
            if left:
                parts.append(f"Left side: {', '.join(set(left))}")
            if right:
                parts.append(f"Right side: {', '.join(set(right))}")
        else:
            parts.append("Unable to provide detailed analysis at this time.")
        
        return ". ".join(parts) + "."
    
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
