"""
OCR Engine - Text Recognition for Signs, Labels, Menus
Uses EasyOCR for robust text detection and recognition.
"""

import time
import base64
import logging
from io import BytesIO
from typing import List, Tuple, Optional
import numpy as np
from PIL import Image

import easyocr

from app.config import get_settings


logger = logging.getLogger(__name__)


class OCREngine:
    """
    EasyOCR-based text recognition engine.
    
    Model selection rationale:
    - EasyOCR: Good balance of accuracy and speed
    - Supports 80+ languages, easy to extend
    - Better than Tesseract for scene text (signs, labels)
    - ~200-500ms per frame on CPU (acceptable for on-demand)
    
    Alternative considered:
    - PaddleOCR: Faster but more complex setup
    - Tesseract: Faster but worse on scene text
    """
    
    def __init__(self, languages: List[str] = None):
        """Initialize the OCR engine."""
        self.settings = get_settings()
        self.languages = languages or self.settings.ocr_languages_list
        self.reader: Optional[easyocr.Reader] = None
        self._loaded = False
    
    def load(self) -> None:
        """Load the OCR model. Called once at startup."""
        if self._loaded:
            return
        
        logger.info(f"Loading EasyOCR with languages: {self.languages}")
        start = time.time()
        
        self.reader = easyocr.Reader(
            self.languages,
            gpu=False,  # CPU-only for hackathon portability
            verbose=False
        )
        
        load_time = (time.time() - start) * 1000
        logger.info(f"EasyOCR loaded in {load_time:.1f}ms")
        self._loaded = True
    
    def decode_image(self, base64_str: str) -> np.ndarray:
        """Decode base64 image to numpy array (RGB)."""
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        
        image_data = base64.b64decode(base64_str)
        image = Image.open(BytesIO(image_data)).convert("RGB")
        return np.array(image)
    
    def read_text(
        self,
        image: np.ndarray,
        min_confidence: float = 0.3
    ) -> Tuple[str, float, float]:
        """
        Extract text from an image.
        
        Args:
            image: RGB image as numpy array
            min_confidence: Minimum confidence for text blocks
            
        Returns:
            Tuple of (combined text, average confidence, inference time ms)
        """
        if not self._loaded:
            self.load()
        
        start = time.time()
        
        # Run OCR
        results = self.reader.readtext(
            image,
            paragraph=True,  # Group text into paragraphs
            min_size=10,
            width_ths=0.7,
        )
        
        inference_time = (time.time() - start) * 1000
        
        # Filter and combine results
        texts = []
        confidences = []
        
        for result in results:
            # EasyOCR returns (bbox, text, confidence)
            if len(result) >= 3:
                bbox, text, conf = result[0], result[1], result[2]
            else:
                text, conf = result[1], result[2] if len(result) > 2 else 0.5
            
            if conf >= min_confidence and text.strip():
                texts.append(text.strip())
                confidences.append(conf)
        
        combined_text = " ".join(texts)
        avg_confidence = np.mean(confidences) if confidences else 0.0
        
        # Clean up text
        combined_text = self._normalize_text(combined_text)
        
        logger.debug(f"OCR found {len(texts)} text blocks in {inference_time:.1f}ms")
        return combined_text, float(avg_confidence), inference_time
    
    def read_text_from_base64(
        self,
        base64_str: str,
        min_confidence: float = 0.3
    ) -> Tuple[str, float, float]:
        """Convenience method to read text from base64 encoded image."""
        image = self.decode_image(base64_str)
        return self.read_text(image, min_confidence)
    
    def _normalize_text(self, text: str) -> str:
        """Clean and normalize OCR output."""
        # Remove excess whitespace
        text = " ".join(text.split())
        
        # Remove common OCR artifacts
        text = text.replace("|", "I")  # Common misread
        text = text.replace("0", "O") if text.isupper() else text
        
        # Limit length for TTS
        max_length = 500
        if len(text) > max_length:
            text = text[:max_length] + "..."
        
        return text


# Singleton instance
_ocr_engine: Optional[OCREngine] = None


def get_ocr_engine() -> OCREngine:
    """Get the singleton OCR engine instance."""
    global _ocr_engine
    if _ocr_engine is None:
        _ocr_engine = OCREngine()
    return _ocr_engine
