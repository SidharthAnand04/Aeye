"""
Memory Service - Orchestrates person recognition and interaction storage.
"""

import hashlib
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

from sqlalchemy.orm import Session

from app.memory.models import Person, Interaction
from app.memory.database import get_db_session, get_audio_path, get_face_path, AUDIO_DIR
from app.memory.face_service import get_face_service, FaceService
from app.memory.transcription import get_transcription_service, TranscriptionService
from app.memory.summarizer import get_summarization_service, SummarizationService

logger = logging.getLogger(__name__)


class ActiveSession:
    """Represents an active recording session."""
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.started_at = datetime.utcnow()
        self.face_encoding = None
        self.face_confidence = None


class MemoryService:
    """
    Central service for managing people and interactions.
    
    Orchestrates:
    - Person identification (face recognition)
    - Interaction recording and storage
    - Transcription and summarization
    """
    
    def __init__(self):
        self.face_service: FaceService = get_face_service()
        self.transcription_service: TranscriptionService = get_transcription_service()
        self.summarization_service: SummarizationService = get_summarization_service()
        
        # Active recording sessions
        self._active_sessions: Dict[str, ActiveSession] = {}
    
    # =========================================================================
    # Session Management
    # =========================================================================
    
    def start_interaction(self) -> Tuple[str, datetime]:
        """
        Start a new interaction recording session.
        
        Returns:
            Tuple of (session_id, started_at)
        """
        session_id = str(uuid.uuid4())
        session = ActiveSession(session_id)
        self._active_sessions[session_id] = session
        
        logger.info(f"Started interaction session: {session_id}")
        return session_id, session.started_at
    
    def get_active_session(self, session_id: str) -> Optional[ActiveSession]:
        """Get an active session by ID."""
        return self._active_sessions.get(session_id)
    
    async def stop_interaction(
        self,
        session_id: str,
        audio_data: Optional[bytes],
        face_image_base64: Optional[str],
        save_audio: bool = False,
        browser_transcript: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Stop an interaction and process it.
        
        Args:
            session_id: The session ID from start_interaction
            audio_data: Raw audio bytes (webm format)
            face_image_base64: Base64 encoded face image for recognition
            save_audio: Whether to persist audio to disk
            browser_transcript: Pre-transcribed text from browser's Web Speech API
            
        Returns:
            Dict with interaction details
        """
        session = self._active_sessions.pop(session_id, None)
        if not session:
            raise ValueError(f"No active session found: {session_id}")
        
        ended_at = datetime.utcnow()
        duration = (ended_at - session.started_at).total_seconds()
        
        logger.info(f"Stopping interaction {session_id}, duration: {duration:.1f}s")
        
        # 1. Identify person from face
        person_id, is_new_person, face_confidence = await self._identify_person(
            face_image_base64, session
        )
        
        # 2. Get transcript - prefer browser's Web Speech API transcript
        transcript = ""
        if browser_transcript and browser_transcript.strip():
            transcript = browser_transcript.strip()
            logger.info(f"Using browser transcript: {len(transcript)} chars")
        elif audio_data and len(audio_data) > 0:
            # Fallback to server-side transcription (if Whisper is available)
            transcript, _ = await self._transcribe_audio(audio_data)
            logger.info(f"Server transcription result: {len(transcript) if transcript else 0} chars")
        
        if not transcript:
            logger.warning("No transcript available from any source")
        
        # 3. Generate summary
        summary_dict = None
        if transcript:
            with get_db_session() as db:
                person = db.query(Person).filter(Person.id == person_id).first()
                person_name = person.name if person else "Unknown"
            
            summary_dict, _, _ = await self.summarization_service.summarize(
                transcript,
                context=f"Conversation with {person_name}"
            )
        else:
            # Provide default summary when no transcript
            summary_dict = {
                "summary": "Brief interaction recorded. No speech detected.",
                "key_points": [],
                "action_items": [],
                "entities": []
            }
        
        # 4. Store interaction
        interaction_id = str(uuid.uuid4())
        audio_path = None
        
        if save_audio and audio_data:
            audio_path = get_audio_path(interaction_id)
            audio_path.write_bytes(audio_data)
            logger.info(f"Saved audio to {audio_path}")
        
        with get_db_session() as db:
            # Update person's last_seen_at
            person = db.query(Person).filter(Person.id == person_id).first()
            if person:
                person.last_seen_at = ended_at
                person_name = person.name
            else:
                person_name = "Unknown"
            
            # Create interaction record
            interaction = Interaction(
                id=interaction_id,
                person_id=person_id,
                started_at=session.started_at,
                ended_at=ended_at,
                duration_seconds=duration,
                transcript=transcript,
                transcript_hash=hashlib.sha256(transcript.encode()).hexdigest() if transcript else None,
                summary_json=summary_dict,
                audio_path=str(audio_path) if audio_path else None,
                audio_saved=save_audio and audio_path is not None,
                face_confidence=face_confidence,
            )
            db.add(interaction)
        
        logger.info(f"Stored interaction {interaction_id} for person {person_id}")
        
        return {
            "interaction_id": interaction_id,
            "person_id": person_id,
            "person_name": person_name,
            "is_new_person": is_new_person,
            "summary": summary_dict,
            "transcript": transcript,
            "duration_seconds": duration,
        }
    
    async def _identify_person(
        self,
        face_image_base64: Optional[str],
        session: ActiveSession
    ) -> Tuple[str, bool, Optional[float]]:
        """
        Identify person from face image.
        
        Returns:
            Tuple of (person_id, is_new_person, confidence)
        """
        if not face_image_base64:
            # No face image provided - create unknown person without photo
            return self._create_unknown_person(), True, None
        
        if not self.face_service.available:
            # Face recognition not available, but we can still save the photo
            # Create person with photo but no face encoding
            person_id = self._create_person_with_photo_only(face_image_base64)
            return person_id, True, None
        
        # Get face encoding
        face_encoding = self.face_service.get_face_encoding_from_base64(face_image_base64)
        if face_encoding is None:
            logger.warning("No face detected in image, saving photo anyway")
            # Still save the photo even if no face was detected
            person_id = self._create_person_with_photo_only(face_image_base64)
            return person_id, True, None
        
        # Get all known face encodings
        known_encodings = self._get_all_face_encodings()
        
        if known_encodings:
            # Try to match
            match = self.face_service.find_best_match(face_encoding, known_encodings)
            if match:
                person_id, confidence = match
                logger.info(f"Matched face to person {person_id} with confidence {confidence:.2f}")
                return person_id, False, confidence
        
        # No match - create new person with this face
        person_id = self._create_person_with_face(face_encoding, face_image_base64)
        return person_id, True, 1.0
    
    def _get_all_face_encodings(self) -> List[Tuple[str, Any]]:
        """Get all stored face encodings."""
        encodings = []
        with get_db_session() as db:
            people = db.query(Person).filter(Person.face_embedding.isnot(None)).all()
            for person in people:
                try:
                    encoding = self.face_service.deserialize_encoding(person.face_embedding)
                    encodings.append((person.id, encoding))
                except Exception as e:
                    logger.error(f"Failed to deserialize face for {person.id}: {e}")
        return encodings
    
    def _create_unknown_person(self) -> str:
        """Create a new unknown person."""
        with get_db_session() as db:
            person = Person(name="Unknown")
            db.add(person)
            db.flush()
            person_id = person.id
        logger.info(f"Created unknown person: {person_id}")
        return person_id
    
    def _create_person_with_face(self, face_encoding, face_image_base64: str) -> str:
        """Create a new person with face encoding."""
        with get_db_session() as db:
            person = Person(
                name="Unknown",
                face_embedding=self.face_service.serialize_encoding(face_encoding)
            )
            db.add(person)
            db.flush()
            person_id = person.id
            
            # Save face image
            face_path = get_face_path(person_id)
            try:
                image = self.face_service.decode_image(face_image_base64)
                self.face_service.extract_and_save_face(image, face_path)
                person.photo_path = str(face_path)
            except Exception as e:
                logger.error(f"Failed to save face image: {e}")
        
        logger.info(f"Created person with face: {person_id}")
        return person_id
    
    def _create_person_with_photo_only(self, face_image_base64: str) -> str:
        """Create a new person with just a photo (no face encoding)."""
        with get_db_session() as db:
            person = Person(name="Unknown")
            db.add(person)
            db.flush()
            person_id = person.id
            
            # Save face image
            face_path = get_face_path(person_id)
            try:
                image = self.face_service.decode_image(face_image_base64)
                if self.face_service.extract_and_save_face(image, face_path):
                    person.photo_path = str(face_path)
                    logger.info(f"Saved photo for person {person_id}")
                else:
                    logger.warning(f"Failed to extract and save face for person {person_id}")
            except Exception as e:
                logger.error(f"Failed to save face image: {e}")
        
        logger.info(f"Created person with photo only: {person_id}")
        return person_id
    
    async def _transcribe_audio(self, audio_data: bytes) -> Tuple[str, float]:
        """Transcribe audio bytes."""
        return self.transcription_service.transcribe_bytes(audio_data, suffix=".webm")
    
    # =========================================================================
    # People Management
    # =========================================================================
    
    def get_all_people(self) -> List[Dict[str, Any]]:
        """Get all people with interaction counts."""
        with get_db_session() as db:
            people = db.query(Person).order_by(Person.last_seen_at.desc()).all()
            return [p.to_dict() for p in people]
    
    def get_person(self, person_id: str) -> Optional[Dict[str, Any]]:
        """Get a single person by ID."""
        with get_db_session() as db:
            person = db.query(Person).filter(Person.id == person_id).first()
            return person.to_dict() if person else None
    
    def get_person_interactions(self, person_id: str) -> List[Dict[str, Any]]:
        """Get all interactions for a person."""
        with get_db_session() as db:
            interactions = (
                db.query(Interaction)
                .filter(Interaction.person_id == person_id)
                .order_by(Interaction.started_at.desc())
                .all()
            )
            return [i.to_dict() for i in interactions]
    
    def rename_person(self, person_id: str, new_name: str) -> Optional[Dict[str, Any]]:
        """Rename a person."""
        with get_db_session() as db:
            person = db.query(Person).filter(Person.id == person_id).first()
            if not person:
                return None
            person.name = new_name
            db.flush()
            return person.to_dict()
    
    def resolve_unknown(
        self, 
        unknown_person_id: str, 
        new_name: str,
        merge_with_person_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Resolve an unknown person to a name, optionally merging with existing.
        """
        with get_db_session() as db:
            unknown_person = db.query(Person).filter(Person.id == unknown_person_id).first()
            if not unknown_person:
                return None
            
            if merge_with_person_id:
                # Merge into existing person
                target_person = db.query(Person).filter(Person.id == merge_with_person_id).first()
                if not target_person:
                    return None
                
                # Move all interactions to target
                db.query(Interaction).filter(
                    Interaction.person_id == unknown_person_id
                ).update({Interaction.person_id: merge_with_person_id})
                
                # Copy face encoding if unknown had one and target doesn't
                if unknown_person.face_embedding and not target_person.face_embedding:
                    target_person.face_embedding = unknown_person.face_embedding
                    target_person.photo_path = unknown_person.photo_path
                
                # Delete unknown person
                db.delete(unknown_person)
                
                logger.info(f"Merged {unknown_person_id} into {merge_with_person_id}")
                return target_person.to_dict()
            else:
                # Just rename
                unknown_person.name = new_name
                logger.info(f"Renamed {unknown_person_id} to {new_name}")
                return unknown_person.to_dict()
    
    def delete_person(self, person_id: str) -> bool:
        """Delete a person and their interactions."""
        with get_db_session() as db:
            person = db.query(Person).filter(Person.id == person_id).first()
            if not person:
                return False
            
            # Delete audio files
            for interaction in person.interactions:
                if interaction.audio_path:
                    try:
                        Path(interaction.audio_path).unlink(missing_ok=True)
                    except:
                        pass
            
            # Delete face image
            if person.photo_path:
                try:
                    Path(person.photo_path).unlink(missing_ok=True)
                except:
                    pass
            
            db.delete(person)
            return True
    
    def get_interaction(self, interaction_id: str) -> Optional[Dict[str, Any]]:
        """Get a single interaction by ID."""
        with get_db_session() as db:
            interaction = db.query(Interaction).filter(Interaction.id == interaction_id).first()
            return interaction.to_dict() if interaction else None


# Singleton
_memory_service: Optional[MemoryService] = None


def get_memory_service() -> MemoryService:
    """Get singleton memory service instance."""
    global _memory_service
    if _memory_service is None:
        _memory_service = MemoryService()
    return _memory_service
