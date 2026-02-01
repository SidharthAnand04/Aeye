"""
SQLAlchemy models for People and Interactions.
"""

import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, String, DateTime, Text, Float, ForeignKey, Boolean, JSON, LargeBinary
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


def generate_uuid() -> str:
    """Generate a URL-safe UUID."""
    return str(uuid.uuid4())


class Person(Base):
    """A recognized person from interactions."""
    __tablename__ = "people"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, default="Unknown")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Recognition data (stored as pickled numpy arrays or null)
    face_embedding = Column(LargeBinary, nullable=True)  # 128-d face encoding
    speaker_embedding = Column(LargeBinary, nullable=True)  # For future speaker recognition
    
    # Metadata
    photo_path = Column(String(512), nullable=True)  # Reference photo path
    notes = Column(Text, nullable=True)
    
    # Relationships
    interactions = relationship("Interaction", back_populates="person", cascade="all, delete-orphan")
    
    @property
    def interaction_count(self) -> int:
        return len(self.interactions) if self.interactions else 0
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_seen_at": self.last_seen_at.isoformat() if self.last_seen_at else None,
            "has_face": self.face_embedding is not None or self.photo_path is not None,
            "photo_path": self.photo_path,
            "notes": self.notes,
            "interaction_count": self.interaction_count,
        }


class Interaction(Base):
    """A recorded interaction/conversation with a person."""
    __tablename__ = "interactions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    person_id = Column(String(36), ForeignKey("people.id"), nullable=False)
    
    # Timing
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    
    # Content
    transcript = Column(Text, nullable=True)
    transcript_hash = Column(String(64), nullable=True)  # SHA256 for dedup
    
    # Summary (JSON structure from Claude Haiku)
    summary_json = Column(JSON, nullable=True)
    # Expected structure:
    # {
    #   "summary": "1-2 sentence overview",
    #   "key_points": ["point 1", "point 2", ...],
    #   "action_items": ["action 1", ...],
    #   "entities": ["name1", "place1", ...]
    # }
    
    # Audio storage
    audio_path = Column(String(512), nullable=True)  # Path to saved audio file
    audio_saved = Column(Boolean, default=False)
    
    # Recognition confidence
    face_confidence = Column(Float, nullable=True)
    speaker_confidence = Column(Float, nullable=True)
    
    # Relationship
    person = relationship("Person", back_populates="interactions")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "person_id": self.person_id,
            "person_name": self.person.name if self.person else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_seconds": self.duration_seconds,
            "transcript": self.transcript,
            "summary": self.summary_json,
            "audio_saved": self.audio_saved,
            "audio_path": self.audio_path if self.audio_saved else None,
            "face_confidence": self.face_confidence,
        }


# Pydantic models for API
from pydantic import BaseModel, Field
from typing import Optional, List


class PersonCreate(BaseModel):
    name: str = Field(default="Unknown")
    notes: Optional[str] = None


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None


class PersonResponse(BaseModel):
    id: str
    name: str
    created_at: Optional[str] = None
    last_seen_at: Optional[str] = None
    has_face: bool = False
    photo_path: Optional[str] = None
    notes: Optional[str] = None
    interaction_count: int = 0


class InteractionSummary(BaseModel):
    summary: str = ""
    key_points: List[str] = Field(default_factory=list)
    action_items: List[str] = Field(default_factory=list)
    entities: List[str] = Field(default_factory=list)


class InteractionResponse(BaseModel):
    id: str
    person_id: str
    person_name: Optional[str] = None
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    transcript: Optional[str] = None
    summary: Optional[InteractionSummary] = None
    audio_saved: bool = False
    audio_path: Optional[str] = None
    face_confidence: Optional[float] = None


class InteractionStartRequest(BaseModel):
    save_audio: bool = False


class InteractionStartResponse(BaseModel):
    session_id: str
    started_at: str


class InteractionStopRequest(BaseModel):
    session_id: str
    save_audio: bool = False


class InteractionStopResponse(BaseModel):
    interaction_id: str
    person_id: str
    person_name: str
    is_new_person: bool
    summary: Optional[InteractionSummary] = None
    transcript: Optional[str] = None


class PersonResolveRequest(BaseModel):
    """Resolve an unknown person to a name, optionally merging with existing."""
    unknown_person_id: str
    new_name: str
    merge_with_person_id: Optional[str] = None  # If set, merge into existing person
