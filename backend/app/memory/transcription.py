"""
Transcription Service using OpenAI Whisper.
Converts audio to text for conversation memory.

NOTE: Whisper requires Python <3.10 due to numba dependency.
For Python 3.13, this provides a fallback placeholder.
Install whisper separately: pip install openai-whisper (in Python 3.9 env)
"""

import os
import logging
import tempfile
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Try to import whisper
WHISPER_AVAILABLE = False
try:
    import whisper
    WHISPER_AVAILABLE = True
    logger.info("Whisper library loaded")
except ImportError as e:
    logger.warning(f"whisper not available: {e}. Transcription will use fallback mode.")
except Exception as e:
    logger.warning(f"whisper failed to load: {e}. Transcription will use fallback mode.")


class TranscriptionService:
    """
    Speech-to-text transcription using OpenAI Whisper.
    
    Model choices:
    - tiny: fastest, ~1GB VRAM, okay accuracy
    - base: good balance, ~1GB VRAM
    - small: better accuracy, ~2GB VRAM
    - medium: high accuracy, ~5GB VRAM
    
    For hackathon MVP, using 'base' for speed/accuracy balance.
    """
    
    MODEL_NAME = "base"  # Can be: tiny, base, small, medium, large
    
    def __init__(self):
        self.model = None
        self.available = WHISPER_AVAILABLE
        self._loaded = False
    
    def load(self):
        """Load Whisper model (lazy loading)."""
        if self._loaded or not self.available:
            return
        
        logger.info(f"Loading Whisper model: {self.MODEL_NAME}")
        try:
            self.model = whisper.load_model(self.MODEL_NAME)
            self._loaded = True
            logger.info("Whisper model loaded")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            self.available = False
    
    def transcribe(
        self, 
        audio_path: Path,
        language: str = "en"
    ) -> Tuple[str, float]:
        """
        Transcribe audio file to text.
        
        Args:
            audio_path: Path to audio file (webm, mp3, wav, etc.)
            language: Language code (e.g., 'en', 'es', 'fr')
            
        Returns:
            Tuple of (transcript, confidence)
        """
        if not self.available:
            return self._fallback_transcribe(audio_path)
        
        if not self._loaded:
            self.load()
        
        if not self._loaded:
            return self._fallback_transcribe(audio_path)
        
        try:
            logger.info(f"Transcribing: {audio_path}")
            
            result = self.model.transcribe(
                str(audio_path),
                language=language,
                fp16=False,  # Use FP32 for CPU compatibility
            )
            
            transcript = result["text"].strip()
            
            # Calculate average confidence from segments
            segments = result.get("segments", [])
            if segments:
                avg_confidence = sum(
                    1.0 - seg.get("no_speech_prob", 0.0) 
                    for seg in segments
                ) / len(segments)
            else:
                avg_confidence = 0.5
            
            logger.info(f"Transcription complete: {len(transcript)} chars, confidence: {avg_confidence:.2f}")
            return transcript, avg_confidence
            
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return "", 0.0
    
    def transcribe_bytes(
        self, 
        audio_data: bytes,
        suffix: str = ".webm",
        language: str = "en"
    ) -> Tuple[str, float]:
        """
        Transcribe audio from bytes.
        
        Args:
            audio_data: Raw audio bytes
            suffix: File extension (e.g., '.webm', '.mp3')
            language: Language code
            
        Returns:
            Tuple of (transcript, confidence)
        """
        # Write to temp file
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_data)
            temp_path = Path(f.name)
        
        try:
            return self.transcribe(temp_path, language)
        finally:
            # Clean up temp file
            try:
                temp_path.unlink()
            except:
                pass
    
    def _fallback_transcribe(self, audio_path: Path) -> Tuple[str, float]:
        """Fallback when Whisper is not available."""
        logger.warning("Using fallback transcription (Whisper not available)")
        # Return a placeholder message that explains the situation
        return "[Audio recorded - Transcription requires Whisper (Python 3.9 compatible)]", 0.3


# Singleton
_transcription_service: Optional[TranscriptionService] = None


def get_transcription_service() -> TranscriptionService:
    """Get singleton transcription service instance."""
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService()
    return _transcription_service
