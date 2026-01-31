"""
Assistive Vision Agent - Core Reasoning Layer
Handles prioritization, novelty detection, cooldowns, and speech gating.
"""

import time
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field

from app.config import get_settings
from app.models import (
    Detection, TrackedObject, AgentAction, AgentStepRequest, 
    AgentStepResponse, AgentTrace, GateDecision, ScoredObject, AgentMode
)
from app.perception.tracker import ObjectTracker, get_tracker


logger = logging.getLogger(__name__)


# Class weights for priority scoring
CLASS_WEIGHTS = {
    "person": 1.0,
    "car": 1.2,  # Higher - dangerous
    "bike": 1.1,
    "dog": 0.8,
    "chair": 0.6,
    "door": 0.5,
    "stairs": 0.9,
}

# Position templates for speech
POSITION_TEMPLATES = {
    "left": ["on your left", "to the left"],
    "right": ["on your right", "to the right"],
    "center": ["ahead", "in front", "directly ahead"],
}


@dataclass
class AgentState:
    """Persistent state for the agent across frames."""
    
    # Timing
    last_speech_time: float = 0.0
    last_speech_text: str = ""
    
    # Per-object cooldowns (track_id -> last_spoken_time)
    object_cooldowns: Dict[int, float] = field(default_factory=dict)
    
    # Per-class cooldowns (label -> last_spoken_time)
    class_cooldowns: Dict[str, float] = field(default_factory=dict)
    
    # Object memory for novelty detection
    seen_objects: Dict[int, float] = field(default_factory=dict)  # id -> first_seen
    
    # Speech history
    speech_count: int = 0


class AssistiveAgent:
    """
    Stateful agent for assistive vision.
    
    Core responsibilities:
    1. Score objects by risk/importance
    2. Detect novelty (new objects, approaching, entered path)
    3. Enforce cooldowns to prevent spam
    4. Generate concise, useful speech
    
    Design principles:
    - Minimize false positives (annoying)
    - Never miss true hazards (dangerous)
    - Prioritize clarity and brevity
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.tracker = get_tracker()
        self.state = AgentState()
        
        # Configuration
        self.cooldown_seconds = self.settings.agent_cooldown_seconds
        self.global_rate_limit = self.settings.agent_global_rate_limit_seconds
        self.proximity_override = self.settings.agent_proximity_override_threshold
    
    def reset(self) -> None:
        """Reset agent state."""
        self.state = AgentState()
        self.tracker.reset()
    
    def step(self, request: AgentStepRequest) -> AgentStepResponse:
        """
        Process one frame and decide whether to speak.
        
        This is the main entry point for the agent loop.
        """
        timestamp = request.timestamp
        
        # Update tracker with new detections
        tracked_objects = self.tracker.update(request.detections, timestamp)
        
        # Score all objects
        scored = self._score_objects(tracked_objects, timestamp)
        
        # Apply gating logic
        action, text, gates, reason = self._apply_gates(
            scored, tracked_objects, timestamp, request.mode
        )
        
        # Build trace for transparency
        trace = AgentTrace(
            top_objects=scored[:5] if scored else [],
            gates=gates,
            decision_reason=reason
        )
        
        # Update state if speaking
        if action == AgentAction.SPEAK and text:
            self.state.last_speech_time = timestamp
            self.state.last_speech_text = text
            self.state.speech_count += 1
            
            # Mark objects as spoken
            for obj in scored[:3]:  # Top 3 objects
                self.state.object_cooldowns[obj.id] = timestamp
                if obj.label not in self.state.class_cooldowns:
                    self.state.class_cooldowns[obj.label] = timestamp
        
        return AgentStepResponse(
            timestamp=timestamp,
            action=action,
            text=text,
            trace=trace
        )
    
    def _score_objects(
        self,
        objects: List[TrackedObject],
        timestamp: float
    ) -> List[ScoredObject]:
        """
        Score objects by priority.
        
        Scoring factors:
        1. Class weight (cars > people > chairs)
        2. In-path weight (center > sides)
        3. Proximity (closer = higher)
        4. Approaching (moving toward camera)
        5. Motion (moving objects more important)
        """
        scored = []
        
        for obj in objects:
            score = 0.0
            reasons = []
            
            # Class weight
            class_weight = CLASS_WEIGHTS.get(obj.label, 0.5)
            score += class_weight
            
            # In-path weight (center of view is priority)
            cx = obj.bbox.center_x
            if 0.35 <= cx <= 0.65:
                score += 1.0
                reasons.append("in_path")
            
            # Proximity (larger bbox = closer)
            area = obj.bbox.area
            if area > 0.30:
                score += 2.0
                reasons.append("very_close")
            elif area > 0.15:
                score += 1.5
                reasons.append("close")
            elif area > 0.05:
                score += 0.5
                reasons.append("nearby")
            
            # Approaching
            if obj.is_approaching:
                score += 1.5
                reasons.append("approaching")
            
            # Motion
            if abs(obj.velocity_x) > 0.03 or abs(obj.velocity_y) > 0.03:
                score += 0.5
                reasons.append("moving")
            
            # Novelty bonus (newly seen)
            if obj.id not in self.state.seen_objects:
                self.state.seen_objects[obj.id] = timestamp
                score += 0.5
                reasons.append("new")
            
            scored.append(ScoredObject(
                id=obj.id,
                label=obj.label,
                score=score,
                reasons=reasons
            ))
        
        # Sort by score descending
        scored.sort(key=lambda x: x.score, reverse=True)
        return scored
    
    def _apply_gates(
        self,
        scored: List[ScoredObject],
        objects: List[TrackedObject],
        timestamp: float,
        mode: AgentMode
    ) -> Tuple[AgentAction, Optional[str], GateDecision, str]:
        """
        Apply gating logic to decide if we should speak.
        
        Gates:
        1. Novelty: Is this new/changed information?
        2. Cooldown: Have we mentioned this object recently?
        3. Global rate: Are we speaking too frequently?
        4. Proximity override: Very close objects bypass gates
        """
        gates = GateDecision()
        
        if not scored:
            return AgentAction.SILENT, None, gates, "no_objects"
        
        top_object = scored[0]
        obj = next((o for o in objects if o.id == top_object.id), None)
        
        if not obj:
            return AgentAction.SILENT, None, gates, "object_not_found"
        
        # Check novelty
        is_novel = self._check_novelty(top_object, obj, timestamp)
        gates.novelty = is_novel
        
        # Check cooldowns
        cooldown_ok = self._check_cooldown(top_object, timestamp)
        gates.cooldown_ok = cooldown_ok
        
        # Check global rate limit
        time_since_last = timestamp - self.state.last_speech_time
        global_ok = time_since_last >= self.global_rate_limit
        gates.global_rate_ok = global_ok
        
        # Check proximity override
        proximity_override = obj.bbox.area > 0.25 and "approaching" in top_object.reasons
        gates.proximity_override = proximity_override
        
        # Decision logic
        if proximity_override:
            # Override all gates for urgent proximity
            text = self._generate_speech(top_object, obj, urgent=True)
            return AgentAction.SPEAK, text, gates, "proximity_override"
        
        if not is_novel:
            return AgentAction.SILENT, None, gates, "not_novel"
        
        if not cooldown_ok:
            return AgentAction.SILENT, None, gates, "cooldown_active"
        
        if not global_ok:
            return AgentAction.SILENT, None, gates, "rate_limited"
        
        # All gates passed
        text = self._generate_speech(top_object, obj, urgent=False)
        return AgentAction.SPEAK, text, gates, "all_gates_passed"
    
    def _check_novelty(
        self,
        scored: ScoredObject,
        obj: TrackedObject,
        timestamp: float
    ) -> bool:
        """Check if this is novel information worth speaking."""
        # New object
        if "new" in scored.reasons:
            return True
        
        # Approaching
        if "approaching" in scored.reasons:
            return True
        
        # Changed from far to close
        if "close" in scored.reasons or "very_close" in scored.reasons:
            # Check if we've mentioned this proximity before
            last_spoken = self.state.object_cooldowns.get(obj.id, 0)
            if timestamp - last_spoken > self.cooldown_seconds * 2:
                return True
        
        # Entered center path
        if "in_path" in scored.reasons:
            return True
        
        return False
    
    def _check_cooldown(self, scored: ScoredObject, timestamp: float) -> bool:
        """Check if object cooldown has passed."""
        last_spoken = self.state.object_cooldowns.get(scored.id, 0)
        return timestamp - last_spoken >= self.cooldown_seconds
    
    def _generate_speech(
        self,
        scored: ScoredObject,
        obj: TrackedObject,
        urgent: bool = False
    ) -> str:
        """Generate concise speech text for an object."""
        label = scored.label.capitalize()
        
        # Determine position
        cx = obj.bbox.center_x
        if cx < 0.35:
            position = "on your left"
        elif cx > 0.65:
            position = "on your right"
        else:
            position = "ahead"
        
        # Determine distance/urgency
        if urgent or "very_close" in scored.reasons:
            prefix = "Careful! "
            distance = "very close"
        elif "close" in scored.reasons:
            prefix = ""
            distance = "close"
        elif "approaching" in scored.reasons:
            prefix = ""
            distance = "approaching"
        else:
            prefix = ""
            distance = ""
        
        # Build message
        if distance:
            message = f"{prefix}{label} {distance}, {position}."
        else:
            message = f"{prefix}{label} {position}."
        
        return message
    
    def get_state_summary(self) -> Dict:
        """Get a summary of agent state for debugging."""
        return {
            "speech_count": self.state.speech_count,
            "last_speech_time": self.state.last_speech_time,
            "last_speech_text": self.state.last_speech_text,
            "tracked_objects": len(self.tracker.tracks),
            "cooldowns_active": len(self.state.object_cooldowns),
        }


# Singleton instance
_agent: Optional[AssistiveAgent] = None


def get_agent() -> AssistiveAgent:
    """Get the singleton agent instance."""
    global _agent
    if _agent is None:
        _agent = AssistiveAgent()
    return _agent
