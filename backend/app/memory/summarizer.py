"""
Summarization Service using Claude Haiku via Keywords AI.
Generates structured summaries of conversations.
"""

import time
import logging
from typing import Dict, Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class SummarizationService:
    """
    Conversation summarization using Claude Haiku via Keywords AI.
    
    Generates structured summaries with:
    - 1-2 sentence overview
    - Key points (max 6)
    - Action items
    - Entities mentioned
    """
    
    SYSTEM_PROMPT = """You are a conversation summarizer. Given a transcript, produce a structured summary in JSON format.

Output ONLY valid JSON with this exact structure:
{
  "summary": "1-2 sentence overview of the conversation",
  "key_points": ["point 1", "point 2", ...],
  "action_items": ["action 1", ...],
  "entities": ["person names", "places", "organizations", ...]
}

Rules:
- Summary: 1-2 sentences, capture the main topic and outcome
- Key points: Max 6 bullet points, most important takeaways
- Action items: Tasks, follow-ups, commitments mentioned (can be empty)
- Entities: Names, places, organizations, products mentioned (can be empty)
- Be concise and factual
- If transcript is unclear or empty, provide minimal output"""

    def __init__(self):
        settings = get_settings()
        self.client = httpx.AsyncClient(
            base_url=settings.keywords_ai_base_url,
            headers={
                "Authorization": f"Bearer {settings.keywords_ai_api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0
        )
    
    async def summarize(
        self, 
        transcript: str,
        context: Optional[str] = None
    ) -> tuple[Dict[str, Any], float, Dict[str, Any]]:
        """
        Summarize a conversation transcript.
        
        Args:
            transcript: The conversation transcript
            context: Optional context (e.g., person's name, location)
            
        Returns:
            Tuple of (summary_dict, inference_time_ms, trace)
        """
        start = time.time()
        
        if not transcript or transcript.strip() == "":
            return {
                "summary": "No conversation recorded.",
                "key_points": [],
                "action_items": [],
                "entities": []
            }, 0.0, {"error": "Empty transcript"}
        
        # Build prompt
        user_prompt = f"Summarize this conversation transcript:\n\n{transcript}"
        if context:
            user_prompt = f"Context: {context}\n\n{user_prompt}"
        
        payload = {
            "model": "claude-3-5-haiku-20241022",  # Claude Haiku for fast, cheap summaries
            "messages": [
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            "max_tokens": 500,
            "temperature": 0.3,
            "customer_identifier": "aeye-memory",
            "metadata": {
                "feature": "conversation_summarization",
                "transcript_length": len(transcript)
            }
        }
        
        trace = {
            "request": {
                "model": payload["model"],
                "transcript_length": len(transcript),
                "has_context": context is not None
            }
        }
        
        try:
            response = await self.client.post("/chat/completions", json=payload)
            response.raise_for_status()
            
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            
            # Parse JSON from response
            import json
            
            # Try to extract JSON from the response
            try:
                # Remove any markdown code blocks if present
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0]
                
                summary = json.loads(content.strip())
            except json.JSONDecodeError:
                # Fallback: create basic summary from raw text
                summary = {
                    "summary": content[:200].strip(),
                    "key_points": [],
                    "action_items": [],
                    "entities": []
                }
            
            # Validate and fix structure
            summary.setdefault("summary", "")
            summary.setdefault("key_points", [])
            summary.setdefault("action_items", [])
            summary.setdefault("entities", [])
            
            # Limit key points to 6
            summary["key_points"] = summary["key_points"][:6]
            
            inference_time = (time.time() - start) * 1000
            
            trace["response"] = {
                "success": True,
                "inference_ms": inference_time,
                "tokens_used": result.get("usage", {})
            }
            
            logger.info(f"Summarization complete in {inference_time:.1f}ms")
            return summary, inference_time, trace
            
        except Exception as e:
            inference_time = (time.time() - start) * 1000
            logger.error(f"Summarization error: {e}")
            
            trace["response"] = {
                "success": False,
                "error": str(e),
                "inference_ms": inference_time
            }
            
            # Return basic fallback
            return {
                "summary": f"Conversation recorded. (Summarization failed: {str(e)[:50]})",
                "key_points": [],
                "action_items": [],
                "entities": []
            }, inference_time, trace
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()


# Singleton
_summarization_service: Optional[SummarizationService] = None


def get_summarization_service() -> SummarizationService:
    """Get singleton summarization service instance."""
    global _summarization_service
    if _summarization_service is None:
        _summarization_service = SummarizationService()
    return _summarization_service
