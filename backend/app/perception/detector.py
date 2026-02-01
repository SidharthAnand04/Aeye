"""
ML Perception Module - Object Detection with Distance Estimation
Handles real-time object detection with YOLOv8 and spatial awareness for assistive vision.

This detector combines:
- YOLOv8 for real-time object detection
- Trigonometric distance estimation (critical for blind user safety)
- Spatial zone detection (left/center/right)
- Normalized bounding box coordinates

Design principles:
- Safety first: accurate distance estimation to prevent collisions
- Clarity: clean output format, easy to consume
- Restraint: only report what's useful, silence redundant data
"""

import time
import base64
import logging
from io import BytesIO
from typing import List, Tuple, Optional, Dict, Any
import numpy as np
from PIL import Image

from ultralytics import YOLO

from app.config import get_settings
from app.models import Detection, BoundingBox


logger = logging.getLogger(__name__)


# ============================================================================
# COCO Classes - Curated for Assistive Vision
# ============================================================================
# Only classes useful for blind navigation and situational awareness
TARGET_CLASSES = {
    # SAFETY-CRITICAL: Obstacles and hazards
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    9: "traffic light",
    10: "fire hydrant",
    11: "stop sign",
    13: "bench",
    
    # OBSTACLES: Furniture and indoor
    56: "chair",
    57: "couch",
    58: "potted plant",
    59: "bed",
    60: "dining table",
    61: "toilet",
    
    # HAZARDS: Sharp objects, breakables
    42: "knife",
    43: "scissors",
    39: "bottle",
    40: "wine glass",
    
    # USEFUL: Electronics and items of interest
    62: "tv",
    63: "laptop",
    67: "cell phone",
    68: "microwave",
    69: "oven",
    72: "refrigerator",
    
    # NAVIGATION AIDS: Vehicles, infrastructure
    7: "truck",
    71: "sink",
}

# Friendly labels for text-to-speech (natural language)
LABEL_MAP = {
    "person": "person",
    "bicycle": "bike",
    "car": "car",
    "motorcycle": "motorcycle",
    "bus": "bus",
    "traffic light": "traffic light",
    "fire hydrant": "fire hydrant",
    "stop sign": "stop sign",
    "bench": "bench",
    "chair": "chair",
    "couch": "couch",
    "potted plant": "plant",
    "bed": "bed",
    "dining table": "table",
    "toilet": "toilet",
    "knife": "knife",
    "scissors": "scissors",
    "bottle": "bottle",
    "wine glass": "glass",
    "tv": "television",
    "laptop": "laptop",
    "cell phone": "phone",
    "microwave": "microwave",
    "oven": "oven",
    "refrigerator": "refrigerator",
    "truck": "truck",
    "sink": "sink",
}

# Real-world heights for distance calibration (meters)
# Used to convert pixel measurements to actual distance
REAL_HEIGHT_M = {
    "person": 1.70,
    "chair": 0.80,
    "table": 0.75,
    "couch": 0.85,
    "bed": 0.60,
    "knife": 0.25,
    "scissors": 0.20,
    "bottle": 0.30,
    "glass": 0.15,
    "phone": 0.15,
    "car": 1.50,
    "bus": 3.00,
    "motorcycle": 1.20,
    "bike": 1.10,
    "traffic light": 0.60,
    "fire hydrant": 0.60,
    "stop sign": 0.60,
    "bench": 0.45,
    "plant": 0.80,
    "toilet": 0.70,
    "television": 0.60,
    "laptop": 0.35,
    "microwave": 0.45,
    "oven": 0.80,
    "refrigerator": 1.70,
    "sink": 0.90,
    "truck": 2.00,
}

# Camera vertical FOV (degrees) - typical smartphone/webcam
CAMERA_VFOV_DEG = 60.0

# ============================================================================
# Distance Estimation (Critical for Blind User Safety)
# ============================================================================

def score_by_vertical_position(cy_norm: float) -> float:
    """
    Vertical position in image predicts depth (for horizontal camera).
    
    Objects lower in frame are closer (assume camera waist-height, looking ~15° down).
    cy_norm=0 (top)    → far
    cy_norm=1 (bottom) → near
    
    Most reliable signal for distance when camera is fixed height.
    """
    return round(min(1.0, max(0.0, cy_norm)), 3)


def score_by_area(area_norm: float) -> float:
    """
    Larger bounding box area → closer object.
    Normalized: 0.25 of image = score 1.0 (very close/large).
    """
    return round(min(1.0, area_norm / 0.25), 3)


def estimate_distance_m(label: str, bbox_h_pixels: float, img_h_pixels: float) -> float:
    """
    Estimate distance in meters using trigonometric calibration.
    
    Uses known object heights (REAL_HEIGHT_M) + camera FOV to infer distance.
    Assumes object is vertically centered in frame (reasonable for detected objects).
    
    Formula:
        distance = (real_height_m) / (bbox_h_norm * 2 * tan(vfov_rad/2))
    
    This is more reliable than area alone because objects have known sizes.
    """
    real_h = REAL_HEIGHT_M.get(label, 0.5)  # fallback 0.5m
    if bbox_h_pixels < 1 or img_h_pixels < 1:
        return 999.0  # far away / invalid
    
    vfov_rad = np.radians(CAMERA_VFOV_DEG)
    bbox_h_norm = bbox_h_pixels / img_h_pixels
    
    if bbox_h_norm < 0.001:  # object too small to trust
        return 999.0
    
    distance = real_h / (bbox_h_norm * 2.0 * np.tan(vfov_rad / 2.0))
    return round(max(0.0, distance), 2)


def compute_distance_info(
    label: str,
    cy_norm: float,
    area_norm: float,
    bbox_h_pixels: float,
    img_h_pixels: float,
    include_debug: bool = False
) -> Dict[str, Any]:
    """
    Combine three distance signals (vertical position, area, calibrated height).
    
    Weights:
        - Vertical position (cy):    40% — most reliable for waist-height camera
        - Bounding box area:         30% — faster but less precise
        - Calibrated distance (m):   30% — physics-based, object-specific
    
    Returns dict with:
        - distance_bucket: "near" | "mid" | "far" (quantized for TTS)
        - distance_est_m: float, estimated meters (primary signal)
        - distance_score: [0,1], normalized confidence (1=near, 0=far)
    """
    s_cy = score_by_vertical_position(cy_norm)
    s_area = score_by_area(area_norm)
    
    dist_m = estimate_distance_m(label, bbox_h_pixels, img_h_pixels)
    # Convert meters to score: 0m=1.0 (near), 10m+=0.0 (far), linear
    s_dist = round(max(0.0, 1.0 - dist_m / 10.0), 3)
    
    # Weighted combination
    W_CY, W_AREA, W_DIST = 0.40, 0.30, 0.30
    final_score = round(W_CY * s_cy + W_AREA * s_area + W_DIST * s_dist, 3)
    
    # Quantize to buckets for natural language (TTS-friendly)
    if dist_m < 2.0:
        bucket = "near"
    elif dist_m < 5.0:
        bucket = "mid"
    else:
        bucket = "far"
    
    result = {
        "distance_bucket": bucket,
        "distance_est_m": dist_m,
        "distance_score": final_score,
    }
    
    if include_debug:
        result["_debug"] = {
            "s_cy": s_cy,
            "s_area": s_area,
            "s_dist": s_dist,
        }
    
    return result


def get_spatial_zone(cx_norm: float) -> str:
    """
    Map normalized X coordinate to spatial zone for TTS guidance.
    
    Divides image into thirds:
        left (0-0.33), center (0.33-0.66), right (0.66-1.0)
    """
    if cx_norm < 0.33:
        return "left"
    elif cx_norm > 0.66:
        return "right"
    else:
        return "center"


# ============================================================================
# Object Detector
# ============================================================================

class ObjectDetector:
    """
    Real-time object detector with distance estimation for assistive vision.
    
    Combines YOLO for fast detection + spatial reasoning for safe navigation.
    
    Model selection:
    - YOLOv8n: 3.2M params, ~80-150ms CPU, ~10-20ms GPU
    - YOLOv8m: 25.9M params, ~400ms CPU, ~40-50ms GPU (higher accuracy)
    
    Trade-off: YOLOv8n for speed/accessibility, YOLOv8m for accuracy
    """
    
    def __init__(self, model_path: str = "yolov8n.pt"):
        """Initialize detector with YOLOv8 model."""
        self.settings = get_settings()
        self.model: Optional[YOLO] = None
        self.model_path = model_path
        self._loaded = False
        
    def load(self) -> None:
        """Load YOLO model once at startup."""
        if self._loaded:
            return
        
        logger.info(f"Loading YOLO model: {self.model_path}")
        start = time.time()
        
        self.model = YOLO(self.model_path)
        
        # Warm up model
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        self.model.predict(dummy, verbose=False)
        
        load_time = (time.time() - start) * 1000
        logger.info(f"YOLO model loaded in {load_time:.1f}ms")
        self._loaded = True
    
    def decode_image(self, base64_str: str) -> np.ndarray:
        """Decode base64 image to numpy array (RGB)."""
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        
        image_data = base64.b64decode(base64_str)
        image = Image.open(BytesIO(image_data)).convert("RGB")
        return np.array(image)
    
    def detect(
        self,
        image: np.ndarray,
        confidence_threshold: Optional[float] = None,
        include_debug: bool = False,
    ) -> Tuple[List[Detection], float]:
        """
        Detect objects in image with distance estimation.
        
        Args:
            image: RGB image as numpy array (H, W, 3)
            confidence_threshold: Override config threshold
            include_debug: Include internal distance calculation data
            
        Returns:
            Tuple of:
            - List[Detection] with spatial and distance info
            - Inference time in milliseconds
        """
        if not self._loaded:
            self.load()
        
        conf = confidence_threshold or self.settings.yolo_confidence_threshold
        
        start = time.time()
        results = self.model.predict(
            image,
            conf=conf,
            verbose=False,
            # Filter to TARGET_CLASSES only (reduces noise)
            classes=list(TARGET_CLASSES.keys()),
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
                    
                    # Skip if class not in target set
                    if cls_id not in TARGET_CLASSES:
                        continue
                    
                    # Get bounding box (xyxy format)
                    x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                    
                    # Normalize to [0, 1]
                    bbox = BoundingBox(
                        x1=max(0.0, min(x1 / w, 1.0)),
                        y1=max(0.0, min(y1 / h, 1.0)),
                        x2=max(0.0, min(x2 / w, 1.0)),
                        y2=max(0.0, min(y2 / h, 1.0)),
                    )
                    
                    # Get friendly label
                    raw_label = self.model.names.get(cls_id, f"object_{cls_id}")
                    label = LABEL_MAP.get(raw_label, raw_label)
                    
                    # Calculate spatial position
                    cx_norm = bbox.center_x
                    cy_norm = bbox.center_y
                    zone = get_spatial_zone(cx_norm)
                    
                    # Calculate distance
                    bbox_h_px = (y2 - y1)
                    area_norm = bbox.area
                    
                    dist_info = compute_distance_info(
                        label=label,
                        cy_norm=cy_norm,
                        area_norm=area_norm,
                        bbox_h_pixels=bbox_h_px,
                        img_h_pixels=h,
                        include_debug=include_debug,
                    )
                    
                    # Create detection with extended info
                    det = Detection(
                        label=label,
                        confidence=conf_score,
                        bbox=bbox,
                    )
                    
                    # Attach auxiliary info as dict (for JSON serialization)
                    det.zone = zone
                    det.distance_bucket = dist_info["distance_bucket"]
                    det.distance_est_m = dist_info["distance_est_m"]
                    det.distance_score = dist_info["distance_score"]
                    
                    if include_debug and "_debug" in dist_info:
                        det._debug_distance = dist_info["_debug"]
                    
                    detections.append(det)
        
        # Sort by distance (closest first - most dangerous/important)
        detections.sort(key=lambda d: d.distance_est_m)
        
        logger.debug(f"Detected {len(detections)} objects in {inference_time:.1f}ms")
        return detections, inference_time
    
    def detect_from_base64(
        self,
        base64_str: str,
        confidence_threshold: Optional[float] = None,
        include_debug: bool = False,
    ) -> Tuple[List[Detection], float]:
        """Convenience method to detect from base64 encoded image."""
        image = self.decode_image(base64_str)
        return self.detect(image, confidence_threshold, include_debug)


# Singleton instance
_detector: Optional[ObjectDetector] = None


def get_detector() -> ObjectDetector:
    """Get the singleton detector instance."""
    global _detector
    if _detector is None:
        settings = get_settings()
        _detector = ObjectDetector(model_path=settings.yolo_model)
    return _detector
