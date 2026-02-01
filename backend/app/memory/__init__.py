"""
Memory Module - People and Conversation Memory
Handles person recognition, interaction recording, and summarization.
"""

from app.memory.models import Person, Interaction
from app.memory.database import get_db, init_db
from app.memory.service import MemoryService, get_memory_service

__all__ = [
    "Person",
    "Interaction", 
    "get_db",
    "init_db",
    "MemoryService",
    "get_memory_service",
]
