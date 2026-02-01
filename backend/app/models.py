"""
Pydantic models for API requests and responses.
Defines the data contracts for the Aeye API.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum


# ============================================================================
# Detection Models
# ============================================================================

class BoundingBox(BaseModel):
    """Normalized bounding box [x1, y1, x2, y2] in range [0, 1]."""
    x1: float = Field(..., ge=0.0, le=1.0)
    y1: float = Field(..., ge=0.0, le=1.0)
    x2: float = Field(..., ge=0.0, le=1.0)
    y2: float = Field(..., ge=0.0, le=1.0)
    
    @property
    def center_x(self) -> float:
        return (self.x1 + self.x2) / 2
    
    @property
    def center_y(self) -> float:
        return (self.y1 + self.y2) / 2
    
    @property
    def width(self) -> float:
        return self.x2 - self.x1
    
    @property
    def height(self) -> float:
        return self.y2 - self.y1
    
    @property
    def area(self) -> float:
        return self.width * self.height


class Detection(BaseModel):
    """
    Single object detection result with spatial and distance information.
    
    Core fields:
    - label: Object class name
    - confidence: Model confidence [0, 1]
    - bbox: Normalized bounding box [0, 1]
    
    Spatial fields (added by detector):
    - zone: "left" | "center" | "right" (for TTS navigation)
    - distance_bucket: "near" | "mid" | "far" (quantized for natural language)
    - distance_est_m: Estimated distance in meters
    - distance_score: [0, 1], confidence in distance estimate (1=near, 0=far)
    """
    label: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    bbox: BoundingBox
    track_id: Optional[int] = None
    
    # Spatial awareness (added by detector)
    zone: Optional[Literal["left", "center", "right"]] = None
    distance_bucket: Optional[Literal["near", "mid", "far"]] = None
    distance_est_m: Optional[float] = None
    distance_score: Optional[float] = None


class DetectionRequest(BaseModel):
    """Request body for /detect endpoint."""
    image_base64: str = Field(..., description="Base64 encoded image")
    timestamp: float = Field(..., description="Frame timestamp in seconds")


class DetectionResponse(BaseModel):
    """Response from /detect endpoint."""
    timestamp: float
    detections: List[Detection]
    inference_time_ms: float


# ============================================================================
# OCR Models
# ============================================================================

class OCRRequest(BaseModel):
    """Request body for /ocr endpoint."""
    image_base64: str = Field(..., description="Base64 encoded image")


class OCRResponse(BaseModel):
    """Response from /ocr endpoint."""
    text: str
    confidence: float
    inference_time_ms: float


# ============================================================================
# Scene Description Models
# ============================================================================

class DescribeRequest(BaseModel):
    """Request body for /describe endpoint."""
    image_base64: str = Field(..., description="Base64 encoded image")
    detections: Optional[List[Detection]] = None


class DescribeResponse(BaseModel):
    """Response from /describe endpoint."""
    description: str
    inference_time_ms: float


# ============================================================================
# Agent Models
# ============================================================================

class AgentMode(str, Enum):
    """Operating modes for the agent."""
    LIVE_ASSIST = "live_assist"
    READ_TEXT = "read_text"
    DESCRIBE = "describe"
    FIND = "find"


class AgentAction(str, Enum):
    """Actions the agent can take."""
    SPEAK = "SPEAK"
    SILENT = "SILENT"


class TrackedObject(BaseModel):
    """Object with tracking information."""
    id: int
    label: str
    confidence: float
    bbox: BoundingBox
    velocity_x: float = 0.0
    velocity_y: float = 0.0
    is_approaching: bool = False
    frames_seen: int = 1
    last_spoken_at: Optional[float] = None


class GateDecision(BaseModel):
    """Decision from each agent gate."""
    novelty: bool = True
    cooldown_ok: bool = True
    global_rate_ok: bool = True
    proximity_override: bool = False


class ScoredObject(BaseModel):
    """Object with priority score."""
    id: int
    label: str
    score: float
    reasons: List[str]


class AgentTrace(BaseModel):
    """Trace information for debugging/transparency."""
    top_objects: List[ScoredObject]
    gates: GateDecision
    decision_reason: str


class AgentStepRequest(BaseModel):
    """Request body for /agent/step endpoint."""
    timestamp: float
    detections: List[Detection]
    mode: AgentMode = AgentMode.LIVE_ASSIST
    find_target: Optional[str] = None


class AgentStepResponse(BaseModel):
    """Response from /agent/step endpoint."""
    timestamp: float
    action: AgentAction
    text: Optional[str] = None
    trace: AgentTrace


# ============================================================================
# Health & Status Models
# ============================================================================

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    version: str
    models_loaded: bool
