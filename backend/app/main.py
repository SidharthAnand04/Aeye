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
# OCR Endpoint (Enhanced with Vision Context)
# ============================================================================

@app.post("/ocr", response_model=OCRResponse)
async def read_text(request: OCRRequest):
    """
    Extract and narrate text from an image.
    
    Pipeline:
    1. Run OCR to extract raw text
    2. Use vision model to contextualize and narrate naturally
    
    Target latency: <1500ms
    """
    try:
        ocr = get_ocr_engine()
        keywords = get_keywords_client()
        
        start = time.time()
        
        # Run OCR
        raw_text, confidence, ocr_time = ocr.read_text_from_base64(
            request.image_base64
        )
        
        if not raw_text or raw_text.strip() == "":
            return OCRResponse(
                text="No text detected in the image.",
                confidence=0.0,
                inference_time_ms=(time.time() - start) * 1000
            )
        
        # Use vision model to create natural narration of the text
        narration, llm_time, trace = await keywords.generate_text_narration(
            image_base64=request.image_base64,
            ocr_text=raw_text
        )
        
        total_time = (time.time() - start) * 1000
        
        logger.info(f"Text narration in {total_time:.1f}ms (OCR: {ocr_time:.1f}ms, LLM: {llm_time:.1f}ms)")
        
        return OCRResponse(
            text=narration,
            confidence=confidence,
            inference_time_ms=total_time
        )
        
    except Exception as e:
        logger.error(f"OCR error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Scene Description Endpoint (Multimodal Vision)
# ============================================================================

@app.post("/describe", response_model=DescribeResponse)
async def describe_scene(request: DescribeRequest):
    """
    Generate a rich, contextual scene description using multimodal vision.
    
    This is the PRIMARY narration endpoint:
    - Sends actual image to Claude Sonnet vision model
    - Generates holistic, spatial scene descriptions
    - Object detections are optional supplementary context
    
    Target latency: <2000ms (vision model)
    """
    try:
        detector = get_detector()
        tracker = get_tracker()
        keywords = get_keywords_client()
        
        start = time.time()
        
        # Run detection for visual overlays (but not for narration)
        detections, detect_time = detector.detect_from_base64(request.image_base64)
        timestamp = time.time()
        tracked = tracker.update(detections, timestamp)
        
        # Generate multimodal scene description
        description, llm_time, trace = await keywords.generate_scene_description(
            image_base64=request.image_base64,
            objects=tracked,  # Optional context
            ocr_text=None
        )
        
        total_time = (time.time() - start) * 1000
        
        logger.info(f"Multimodal scene description in {total_time:.1f}ms (detect: {detect_time:.1f}ms, llm: {llm_time:.1f}ms)")
        
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
# Combined Pipeline Endpoint (for detection + overlays only)
# ============================================================================

@app.post("/pipeline")
async def run_pipeline(request: DetectionRequest):
    """
    Run object detection for visual overlays.
    
    This endpoint is for UI/debug purposes only:
    - Returns bounding boxes for visual rendering
    - Does NOT generate spoken narration
    - Used in parallel with /live for visual feedback
    
    Target latency: <200ms
    """
    try:
        detector = get_detector()
        tracker = get_tracker()
        
        start = time.time()
        
        # Run detection
        detections, detect_time = detector.detect_from_base64(
            request.image_base64
        )
        
        # Update tracker for persistent IDs
        tracked = tracker.update(detections, request.timestamp)
        
        # Update detections with track IDs
        for det in detections:
            for t in tracked:
                if t.label == det.label and abs(t.bbox.x1 - det.bbox.x1) < 0.1:
                    det.track_id = t.id
                    break
        
        total_time = (time.time() - start) * 1000
        
        return {
            "timestamp": request.timestamp,
            "detections": [d.model_dump() for d in detections],
            "timing": {
                "detection_ms": detect_time,
                "total_ms": total_time
            }
        }
        
    except Exception as e:
        logger.error(f"Pipeline error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Live Assist Endpoint (Blocking Narrative Mode)
# ============================================================================

@app.post("/live")
async def live_assist(request: DescribeRequest):
    """
    Live Assist mode - generates a complete scene narrative.
    
    This is the PRIMARY endpoint for live mode:
    1. Captures full frame
    2. Runs multimodal scene understanding
    3. Returns complete narrative for speech
    4. Frontend should speak to completion before next request
    
    Key behaviors:
    - Blocking: Frontend waits for this to complete
    - Non-interrupting: Frontend speaks entire response
    - Narrative-only: No alerts, just scene description
    - Rich context: Environmental understanding, not object lists
    
    Target latency: <2500ms
    """
    try:
        detector = get_detector()
        tracker = get_tracker()
        keywords = get_keywords_client()
        
        start = time.time()
        
        # Run detection for context (not for narration)
        detections, detect_time = detector.detect_from_base64(request.image_base64)
        timestamp = time.time()
        tracked = tracker.update(detections, timestamp)
        
        # Generate multimodal scene description
        description, llm_time, trace = await keywords.generate_scene_description(
            image_base64=request.image_base64,
            objects=tracked,
            ocr_text=None
        )
        
        total_time = (time.time() - start) * 1000
        
        logger.info(f"Live assist narrative in {total_time:.1f}ms")
        
        return {
            "timestamp": timestamp,
            "narrative": description,
            "detections": [d.model_dump() for d in detections],
            "timing": {
                "detection_ms": detect_time,
                "llm_ms": llm_time,
                "total_ms": total_time
            },
            "trace": trace
        }
        
    except Exception as e:
        logger.error(f"Live assist error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
