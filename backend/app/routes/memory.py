"""
Memory API Routes - People and Interaction Management
"""

import base64
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.memory.service import get_memory_service, MemoryService
from app.memory.database import init_db
from app.memory.models import (
    PersonResponse,
    InteractionResponse,
    InteractionStartResponse,
    InteractionStopResponse,
    PersonResolveRequest,
    InteractionSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/memory", tags=["memory"])


# Initialize database on module load
init_db()


def get_service() -> MemoryService:
    """Dependency for getting memory service."""
    return get_memory_service()


# =============================================================================
# Interaction Endpoints
# =============================================================================

class StartInteractionRequest(BaseModel):
    """Request to start an interaction."""
    pass  # No parameters needed


@router.post("/interaction/start", response_model=InteractionStartResponse)
async def start_interaction(
    service: MemoryService = Depends(get_service)
):
    """
    Start a new interaction recording session.
    
    Returns a session_id to use when stopping the interaction.
    """
    session_id, started_at = service.start_interaction()
    return InteractionStartResponse(
        session_id=session_id,
        started_at=started_at.isoformat()
    )


@router.post("/interaction/stop", response_model=InteractionStopResponse)
async def stop_interaction(
    session_id: str = Form(...),
    save_audio: bool = Form(False),
    transcript: Optional[str] = Form(None),  # Browser-transcribed text from Web Speech API
    audio: Optional[UploadFile] = File(None),
    face_image: Optional[str] = Form(None),  # Base64 encoded
    service: MemoryService = Depends(get_service)
):
    """
    Stop an interaction and process it.
    
    - Uploads audio file
    - Optionally includes face image for recognition
    - Uses browser transcript from Web Speech API (preferred)
    - Falls back to server-side transcription if no browser transcript
    - Identifies person
    - Generates summary
    - Stores everything
    """
    try:
        # Read audio data
        audio_data = None
        if audio:
            audio_data = await audio.read()
            logger.info(f"Received audio: {len(audio_data)} bytes")
        
        # Log transcript source
        if transcript:
            logger.info(f"Using browser transcript: {len(transcript)} chars")
        
        result = await service.stop_interaction(
            session_id=session_id,
            audio_data=audio_data,
            face_image_base64=face_image,
            save_audio=save_audio,
            browser_transcript=transcript  # Pass browser transcript to service
        )
        
        summary = None
        if result.get("summary"):
            summary = InteractionSummary(**result["summary"])
        
        return InteractionStopResponse(
            interaction_id=result["interaction_id"],
            person_id=result["person_id"],
            person_name=result["person_name"],
            is_new_person=result["is_new_person"],
            summary=summary,
            transcript=result.get("transcript")
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error stopping interaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# People Endpoints
# =============================================================================

@router.get("/people")
async def list_people(
    service: MemoryService = Depends(get_service)
):
    """
    Get all recognized people.
    
    Returns list sorted by last interaction (most recent first).
    """
    people = service.get_all_people()
    return {"people": people}


@router.get("/people/{person_id}")
async def get_person(
    person_id: str,
    service: MemoryService = Depends(get_service)
):
    """Get a single person by ID."""
    person = service.get_person(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.get("/people/{person_id}/interactions")
async def get_person_interactions(
    person_id: str,
    service: MemoryService = Depends(get_service)
):
    """Get all interactions for a person."""
    # Verify person exists
    person = service.get_person(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    
    interactions = service.get_person_interactions(person_id)
    return {
        "person": person,
        "interactions": interactions
    }


class RenameRequest(BaseModel):
    name: str


@router.post("/people/{person_id}/rename")
async def rename_person(
    person_id: str,
    request: RenameRequest,
    service: MemoryService = Depends(get_service)
):
    """Rename a person."""
    person = service.rename_person(person_id, request.name)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.post("/people/resolve")
async def resolve_person(
    request: PersonResolveRequest,
    service: MemoryService = Depends(get_service)
):
    """
    Resolve an unknown person to a name.
    
    Can optionally merge with an existing person.
    """
    result = service.resolve_unknown(
        unknown_person_id=request.unknown_person_id,
        new_name=request.new_name,
        merge_with_person_id=request.merge_with_person_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Person not found")
    return result


@router.delete("/people/{person_id}")
async def delete_person(
    person_id: str,
    service: MemoryService = Depends(get_service)
):
    """Delete a person and all their interactions."""
    success = service.delete_person(person_id)
    if not success:
        raise HTTPException(status_code=404, detail="Person not found")
    return {"status": "deleted", "person_id": person_id}


@router.get("/people/{person_id}/photo")
async def get_person_photo(
    person_id: str,
    service: MemoryService = Depends(get_service)
):
    """
    Get the photo for a person (if available).
    Returns the face image captured during interaction.
    """
    person = service.get_person(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    
    if not person.get("has_face") or not person.get("photo_path"):
        raise HTTPException(status_code=404, detail="No photo available for this person")
    
    from pathlib import Path
    photo_path = Path(person["photo_path"])
    if not photo_path.exists():
        raise HTTPException(status_code=404, detail="Photo file not found")
    
    return FileResponse(
        photo_path,
        media_type="image/jpeg",
        filename=f"person_{person_id}.jpg"
    )


# =============================================================================
# Interaction Detail Endpoints
# =============================================================================

@router.get("/interactions/{interaction_id}")
async def get_interaction(
    interaction_id: str,
    service: MemoryService = Depends(get_service)
):
    """Get a single interaction by ID."""
    interaction = service.get_interaction(interaction_id)
    if not interaction:
        raise HTTPException(status_code=404, detail="Interaction not found")
    return interaction


@router.get("/interactions/{interaction_id}/audio")
async def get_interaction_audio(
    interaction_id: str,
    service: MemoryService = Depends(get_service)
):
    """
    Get the audio file for an interaction (if saved).
    """
    interaction = service.get_interaction(interaction_id)
    if not interaction:
        raise HTTPException(status_code=404, detail="Interaction not found")
    
    if not interaction.get("audio_saved") or not interaction.get("audio_path"):
        raise HTTPException(status_code=404, detail="Audio not saved for this interaction")
    
    from pathlib import Path
    audio_path = Path(interaction["audio_path"])
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        audio_path,
        media_type="audio/webm",
        filename=f"interaction_{interaction_id}.webm"
    )
