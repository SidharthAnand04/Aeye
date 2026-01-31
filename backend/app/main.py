"""
Aeye Backend - FastAPI Application
Real-time assistive vision system API.
"""

import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.models import (
    DetectionRequest, DetectionResponse,
    OCRRequest, OCRResponse,
    DescribeRequest, DescribeResponse,
    AgentStepRequest, AgentStepResponse,
    HealthResponse
)
from app.perception import get_detector, get_ocr_engine, get_tracker
from app.agent import get_agent, get_keywords_client


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    logger.info("Starting Aeye backend...")
    
    # Load ML models on startup (warm up)
    settings = get_settings()
    
    logger.info("Loading object detection model...")
    detector = get_detector()
    detector.load()
    
    # OCR is loaded lazily on first use (slower to load)
    logger.info("OCR will be loaded on first use")
    
    # Initialize agent
    agent = get_agent()
    logger.info("Agent initialized")
    
    logger.info(f"Aeye backend v{__version__} ready!")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Aeye backend...")
    keywords_client = get_keywords_client()
    await keywords_client.close()


# Create FastAPI app
app = FastAPI(
    title="Aeye - Assistive Vision API",
    description="Real-time camera-based assistive vision for blind and low-vision users",
    version=__version__,
    lifespan=lifespan
)

# Configure CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health Check
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    detector = get_detector()
    return HealthResponse(
        status="ok",
        version=__version__,
        models_loaded=detector._loaded
    )


# ============================================================================
# Detection Endpoint
# ============================================================================

@app.post("/detect", response_model=DetectionResponse)
async def detect_objects(request: DetectionRequest):
    """
    Run object detection on a frame.
    
    Returns bounding boxes, labels, and confidence scores for detected objects.
    Target latency: <150ms
    """
    try:
        detector = get_detector()
        tracker = get_tracker()
        
        # Run detection
        detections, inference_time = detector.detect_from_base64(
            request.image_base64
        )
        
        # Update tracker to get persistent IDs
        tracked = tracker.update(detections, request.timestamp)
        
        # Update detections with track IDs
        for i, det in enumerate(detections):
            # Find matching tracked object
            for t in tracked:
                if t.label == det.label and abs(t.bbox.x1 - det.bbox.x1) < 0.1:
                    det.track_id = t.id
                    break
        
        return DetectionResponse(
            timestamp=request.timestamp,
            detections=detections,
            inference_time_ms=inference_time
        )
        
    except Exception as e:
        logger.error(f"Detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# OCR Endpoint
# ============================================================================

@app.post("/ocr", response_model=OCRResponse)
async def read_text(request: OCRRequest):
    """
    Extract text from an image using OCR.
    
    Used for reading signs, labels, menus, etc.
    Target latency: <500ms
    """
    try:
        ocr = get_ocr_engine()
        
        text, confidence, inference_time = ocr.read_text_from_base64(
            request.image_base64
        )
        
        if not text:
            text = "No text detected."
            confidence = 0.0
        
        return OCRResponse(
            text=text,
            confidence=confidence,
            inference_time_ms=inference_time
        )
        
    except Exception as e:
        logger.error(f"OCR error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Scene Description Endpoint
# ============================================================================

@app.post("/describe", response_model=DescribeResponse)
async def describe_scene(request: DescribeRequest):
    """
    Generate a natural language description of the scene.
    
    Uses object detections + Claude Haiku to create a concise summary.
    Target latency: <600ms
    """
    try:
        detector = get_detector()
        tracker = get_tracker()
        keywords = get_keywords_client()
        
        start = time.time()
        
        # If no detections provided, run detection first
        if request.detections is None:
            detections, _ = detector.detect_from_base64(request.image_base64)
        else:
            detections = request.detections
        
        # Get timestamp
        timestamp = time.time()
        
        # Update tracker
        tracked = tracker.update(detections, timestamp)
        
        # Generate description via Keywords AI
        description, llm_time, trace = await keywords.generate_scene_description(
            tracked
        )
        
        total_time = (time.time() - start) * 1000
        
        logger.info(f"Scene description generated in {total_time:.1f}ms")
        
        return DescribeResponse(
            description=description,
            inference_time_ms=total_time
        )
        
    except Exception as e:
        logger.error(f"Describe error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Agent Step Endpoint
# ============================================================================

@app.post("/agent/step", response_model=AgentStepResponse)
async def agent_step(request: AgentStepRequest):
    """
    Process one frame through the agent reasoning layer.
    
    The agent:
    1. Updates tracking state
    2. Scores objects by priority
    3. Applies novelty and cooldown gates
    4. Decides whether to speak
    
    Returns the action (SPEAK/SILENT) and trace for transparency.
    """
    try:
        agent = get_agent()
        response = agent.step(request)
        return response
        
    except Exception as e:
        logger.error(f"Agent error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Agent State Endpoint (for debugging)
# ============================================================================

@app.get("/agent/state")
async def get_agent_state():
    """Get current agent state for debugging."""
    agent = get_agent()
    return agent.get_state_summary()


@app.post("/agent/reset")
async def reset_agent():
    """Reset agent state."""
    agent = get_agent()
    agent.reset()
    return {"status": "reset"}


# ============================================================================
# Combined Pipeline Endpoint (optimized for frontend)
# ============================================================================

@app.post("/pipeline")
async def run_pipeline(request: DetectionRequest):
    """
    Run the full detection + agent pipeline in one call.
    
    This is the optimized endpoint for the frontend loop:
    1. Decode image
    2. Run object detection
    3. Update tracking
    4. Run agent reasoning
    5. Return detections + agent decision
    
    Target latency: <300ms
    """
    try:
        detector = get_detector()
        agent = get_agent()
        
        start = time.time()
        
        # Run detection
        detections, detect_time = detector.detect_from_base64(
            request.image_base64
        )
        
        # Run agent step
        agent_request = AgentStepRequest(
            timestamp=request.timestamp,
            detections=detections
        )
        agent_response = agent.step(agent_request)
        
        total_time = (time.time() - start) * 1000
        
        return {
            "timestamp": request.timestamp,
            "detections": [d.model_dump() for d in detections],
            "agent": agent_response.model_dump(),
            "timing": {
                "detection_ms": detect_time,
                "total_ms": total_time
            }
        }
        
    except Exception as e:
        logger.error(f"Pipeline error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
