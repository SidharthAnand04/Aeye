"""
ML Perception Module - Object Detection with YOLOv8
Handles real-time object detection with lightweight YOLOv8n model.
"""

import time
import base64
import logging
from io import BytesIO
from typing import List, Tuple, Optional
import numpy as np
from PIL import Image

from ultralytics import YOLO

from app.config import get_settings
from app.models import Detection, BoundingBox


logger = logging.getLogger(__name__)


# Target classes for assistive vision (COCO class IDs)
TARGET_CLASSES = {
    0: "person",
    1: "bicycle",  # maps to "bike"
    2: "car",
    16: "dog",
    56: "chair",
    # Note: COCO doesn't have door/stairs - we'll use custom mapping
}

# Friendly label mapping
LABEL_MAP = {
    "bicycle": "bike",
    "person": "person",
    "car": "car",
    "dog": "dog",
    "chair": "chair",
}


class ObjectDetector:
    """
    YOLOv8n-based object detector optimized for real-time assistive vision.
    
    Model selection rationale:
    - YOLOv8n: Smallest model, ~3.2M params, ~6.3 GFLOPs
    - Inference: ~80-150ms on CPU, ~10-20ms on GPU
    - Accuracy: mAP50 ~37.3 on COCO (sufficient for large obstacles)
    - Trade-off: Speed > accuracy for real-time assistive feedback
    """
    
    def __init__(self, model_path: str = "yolov8n.pt"):
        """Initialize the detector with YOLOv8n model."""
        self.settings = get_settings()
        self.model: Optional[YOLO] = None
        self.model_path = model_path
        self._loaded = False
        
    def load(self) -> None:
        """Load the YOLO model. Called once at startup."""
        if self._loaded:
            return
            
        logger.info(f"Loading YOLO model: {self.model_path}")
        start = time.time()
        
        self.model = YOLO(self.model_path)
        # Warm up the model
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        self.model.predict(dummy, verbose=False)
        
        load_time = (time.time() - start) * 1000
        logger.info(f"YOLO model loaded in {load_time:.1f}ms")
        self._loaded = True
    
    def decode_image(self, base64_str: str) -> np.ndarray:
        """Decode base64 image to numpy array (RGB)."""
        # Remove data URL prefix if present
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        
        image_data = base64.b64decode(base64_str)
        image = Image.open(BytesIO(image_data)).convert("RGB")
        return np.array(image)
    
    def detect(
        self,
        image: np.ndarray,
        confidence_threshold: Optional[float] = None
    ) -> Tuple[List[Detection], float]:
        """
        Run object detection on an image.
        
        Args:
            image: RGB image as numpy array (H, W, 3)
            confidence_threshold: Override default confidence threshold
            
        Returns:
            Tuple of (list of detections, inference time in ms)
        """
        if not self._loaded:
            self.load()
        
        conf = confidence_threshold or self.settings.yolo_confidence_threshold
        
        start = time.time()
        
        # Run inference
        results = self.model.predict(
            image,
            conf=conf,
            verbose=False,
            classes=list(TARGET_CLASSES.keys())  # Filter to target classes only
        )
        
        inference_time = (time.time() - start) * 1000
        
        detections = []
        if results and len(results) > 0:
            result = results[0]
            boxes = result.boxes
            
            if boxes is not None:
                h, w = image.shape[:2]
                
                for i in range(len(boxes)):
                    cls_id = int(boxes.cls[i].item())
                    conf_score = float(boxes.conf[i].item())
                    
                    # Get box coordinates (xyxy format)
                    x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                    
                    # Normalize to [0, 1]
                    bbox = BoundingBox(
                        x1=x1 / w,
                        y1=y1 / h,
                        x2=x2 / w,
                        y2=y2 / h
                    )
                    
                    # Get label with friendly mapping
                    raw_label = TARGET_CLASSES.get(cls_id, f"class_{cls_id}")
                    label = LABEL_MAP.get(raw_label, raw_label)
                    
                    detections.append(Detection(
                        label=label,
                        confidence=conf_score,
                        bbox=bbox
                    ))
        
        logger.debug(f"Detected {len(detections)} objects in {inference_time:.1f}ms")
        return detections, inference_time
    
    def detect_from_base64(
        self,
        base64_str: str,
        confidence_threshold: Optional[float] = None
    ) -> Tuple[List[Detection], float]:
        """Convenience method to detect from base64 encoded image."""
        image = self.decode_image(base64_str)
        return self.detect(image, confidence_threshold)


# Singleton instance
_detector: Optional[ObjectDetector] = None


def get_detector() -> ObjectDetector:
    """Get the singleton detector instance."""
    global _detector
    if _detector is None:
        settings = get_settings()
        _detector = ObjectDetector(model_path=settings.yolo_model)
    return _detector
