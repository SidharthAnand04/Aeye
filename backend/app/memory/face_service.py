"""
Face Recognition Service
Uses DeepFace library for face detection and matching.

DeepFace supports multiple backends: VGG-Face, Facenet, OpenFace, DeepFace, DeepID, ArcFace, Dlib, SFace.
We use Facenet512 for good accuracy and reasonable speed.
"""

import base64
import logging
import pickle
from io import BytesIO
from pathlib import Path
from typing import Optional, Tuple, List
import numpy as np
from PIL import Image
import tempfile
import os

logger = logging.getLogger(__name__)

# Try to import DeepFace, but provide fallback
DEEPFACE_AVAILABLE = False
DeepFace = None

try:
    from deepface import DeepFace as DF
    DeepFace = DF
    DEEPFACE_AVAILABLE = True
    logger.info("DeepFace library loaded successfully")
except ImportError as e:
    logger.warning(f"DeepFace not available: {e}. Face matching will be disabled.")
except Exception as e:
    logger.warning(f"DeepFace failed to load: {e}. Face matching will be disabled.")


class FaceService:
    """
    Face detection and recognition service using DeepFace.
    
    Uses Facenet512 model for 512-dimensional embeddings.
    Cosine distance threshold: 0.40 (lower = stricter matching)
    """
    
    # Cosine distance threshold for matching (DeepFace default for Facenet512 is ~0.30)
    MATCH_THRESHOLD = 0.40  # Lower = stricter matching
    MODEL_NAME = "Facenet512"  # Good balance of accuracy and speed
    DETECTOR_BACKEND = "opencv"  # Fast and reliable
    
    def __init__(self):
        self.available = DEEPFACE_AVAILABLE
        self._model_loaded = False
        
        # Pre-load the model on first use
        if self.available:
            try:
                # Warm up the model by building it
                logger.info(f"Loading DeepFace model: {self.MODEL_NAME}...")
                # This will download and cache the model if needed
                DeepFace.build_model(self.MODEL_NAME)
                self._model_loaded = True
                logger.info(f"DeepFace model {self.MODEL_NAME} loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to preload DeepFace model: {e}")
                self._model_loaded = False
    
    def decode_image(self, base64_str: str) -> np.ndarray:
        """Decode base64 image to numpy array (RGB)."""
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        
        image_data = base64.b64decode(base64_str)
        image = Image.open(BytesIO(image_data)).convert("RGB")
        return np.array(image)
    
    def _save_temp_image(self, image: np.ndarray) -> str:
        """Save image to temp file for DeepFace (it works better with file paths)."""
        temp_file = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        pil_image = Image.fromarray(image)
        pil_image.save(temp_file.name, "JPEG", quality=95)
        return temp_file.name
    
    def detect_faces(self, image: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """
        Detect faces in an image.
        
        Returns list of (top, right, bottom, left) tuples for compatibility.
        """
        if not self.available:
            return []
        
        try:
            temp_path = self._save_temp_image(image)
            try:
                # Use DeepFace's extract_faces which detects and aligns faces
                faces = DeepFace.extract_faces(
                    img_path=temp_path,
                    detector_backend=self.DETECTOR_BACKEND,
                    enforce_detection=False
                )
                
                locations = []
                for face_data in faces:
                    if face_data.get("confidence", 0) > 0.5:
                        facial_area = face_data.get("facial_area", {})
                        x = facial_area.get("x", 0)
                        y = facial_area.get("y", 0)
                        w = facial_area.get("w", 0)
                        h = facial_area.get("h", 0)
                        # Convert to (top, right, bottom, left) format
                        locations.append((y, x + w, y + h, x))
                
                return locations
            finally:
                os.unlink(temp_path)
        except Exception as e:
            logger.error(f"Face detection error: {e}")
            return []
    
    def get_face_encoding(self, image: np.ndarray, face_location: Optional[Tuple] = None) -> Optional[np.ndarray]:
        """
        Get face embedding from image using DeepFace.
        
        Args:
            image: RGB image as numpy array
            face_location: Optional (top, right, bottom, left) tuple. If provided, crops to that region.
            
        Returns:
            512-dimensional numpy array (for Facenet512) or None if no face found.
        """
        if not self.available:
            return None
        
        try:
            # If face location provided, crop the image
            if face_location:
                top, right, bottom, left = face_location
                image = image[top:bottom, left:right]
            
            temp_path = self._save_temp_image(image)
            try:
                # Get embedding using DeepFace
                embeddings = DeepFace.represent(
                    img_path=temp_path,
                    model_name=self.MODEL_NAME,
                    detector_backend=self.DETECTOR_BACKEND,
                    enforce_detection=False
                )
                
                if embeddings and len(embeddings) > 0:
                    embedding = embeddings[0].get("embedding", [])
                    if embedding:
                        return np.array(embedding)
                return None
            finally:
                os.unlink(temp_path)
        except Exception as e:
            logger.error(f"Face encoding error: {e}")
            return None
    
    def get_face_encoding_from_base64(self, base64_str: str) -> Optional[np.ndarray]:
        """Get face encoding from base64 image."""
        image = self.decode_image(base64_str)
        return self.get_face_encoding(image)
    
    def compare_faces(
        self, 
        known_encoding: np.ndarray, 
        unknown_encoding: np.ndarray
    ) -> Tuple[bool, float]:
        """
        Compare two face encodings using cosine distance.
        
        Returns:
            Tuple of (is_match, confidence) where higher confidence = better match (0 to 1)
        """
        if not self.available:
            return False, 0.0
        
        try:
            # Compute cosine distance
            known_norm = known_encoding / np.linalg.norm(known_encoding)
            unknown_norm = unknown_encoding / np.linalg.norm(unknown_encoding)
            cosine_distance = 1 - np.dot(known_norm, unknown_norm)
            
            is_match = cosine_distance < self.MATCH_THRESHOLD
            # Convert distance to confidence (0 = no match, 1 = perfect match)
            confidence = max(0.0, 1.0 - (cosine_distance / self.MATCH_THRESHOLD))
            
            logger.debug(f"Face comparison: distance={cosine_distance:.3f}, threshold={self.MATCH_THRESHOLD}, match={is_match}")
            
            return is_match, confidence
        except Exception as e:
            logger.error(f"Face comparison error: {e}")
            return False, 0.0
    
    def find_best_match(
        self,
        unknown_encoding: np.ndarray,
        known_encodings: List[Tuple[str, np.ndarray]]  # List of (person_id, encoding)
    ) -> Optional[Tuple[str, float]]:
        """
        Find the best matching person from a list of known encodings.
        
        Args:
            unknown_encoding: Face encoding to match
            known_encodings: List of (person_id, encoding) tuples
            
        Returns:
            Tuple of (person_id, confidence) or None if no match
        """
        if not self.available or not known_encodings:
            return None
        
        best_match = None
        best_confidence = 0.0
        
        for person_id, known_encoding in known_encodings:
            is_match, confidence = self.compare_faces(known_encoding, unknown_encoding)
            logger.debug(f"Comparing with person {person_id}: match={is_match}, confidence={confidence:.3f}")
            if is_match and confidence > best_confidence:
                best_match = person_id
                best_confidence = confidence
        
        if best_match:
            logger.info(f"Found match: person_id={best_match}, confidence={best_confidence:.3f}")
            return best_match, best_confidence
        
        logger.info("No matching face found among known people")
        return None
    
    def serialize_encoding(self, encoding: np.ndarray) -> bytes:
        """Serialize face encoding to bytes for database storage."""
        return pickle.dumps(encoding)
    
    def deserialize_encoding(self, data: bytes) -> np.ndarray:
        """Deserialize face encoding from database."""
        return pickle.loads(data)
    
    def extract_and_save_face(
        self, 
        image: np.ndarray, 
        save_path: Path,
        face_location: Optional[Tuple] = None
    ) -> bool:
        """
        Extract face from image and save as reference photo.
        If DeepFace is not available or no face detected, saves the full image.
        """
        try:
            if face_location is None and self.available:
                locations = self.detect_faces(image)
                if locations:
                    face_location = locations[0]
            
            if face_location:
                top, right, bottom, left = face_location
                # Add padding
                padding = 40
                h, w = image.shape[:2]
                top = max(0, top - padding)
                bottom = min(h, bottom + padding)
                left = max(0, left - padding)
                right = min(w, right + padding)
                
                face_image = image[top:bottom, left:right]
                logger.info(f"Extracted face region for saving")
            else:
                # No face detection available or no face found - save the whole image
                logger.info("No face detected, saving full image as reference")
                face_image = image
            
            pil_image = Image.fromarray(face_image)
            pil_image.save(save_path, "JPEG", quality=85)
            logger.info(f"Saved face image to {save_path}")
            return True
        except Exception as e:
            logger.error(f"Error saving face image: {e}")
            return False


# Singleton
_face_service: Optional[FaceService] = None


def get_face_service() -> FaceService:
    """Get singleton face service instance."""
    global _face_service
    if _face_service is None:
        _face_service = FaceService()
    return _face_service
