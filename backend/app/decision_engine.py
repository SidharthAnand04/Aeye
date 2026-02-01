"""
Decision Engine for Assistive Vision
Converts detection events into automatic behavior decisions and spoken output.

Core Strategy for Blind Users:
- Infer context automatically (navigation, hazard, crossing, reading, idle)
- Generate short, actionable speech (3-9 words max)
- Minimize repetition and background noise
- Prioritize safety (collision avoidance, street crossing, stairs, obstacles)
- Maintain user autonomy (inform, not control)

Responsibilities:
1. Infer active "mode" from detected objects and context (internal only)
2. Filter redundant and low-priority detections
3. Prioritize what to speak based on urgency and novelty
4. Generate short, natural, actionable phrases
5. Maintain anti-spam state and cooldown windows
"""

import time
import logging
from typing import List, Optional, Dict, Tuple, Set
from enum import Enum
from collections import defaultdict, deque
from dataclasses import dataclass

from app.models import Detection


logger = logging.getLogger(__name__)


class InferredMode(str, Enum):
    """
    Internal modes inferred from context.
    Never exposed to user; only used for decision-making.
    """
    NAVIGATION = "navigation"      # Walking, avoiding obstacles, general movement
    HAZARD = "hazard"              # Immediate danger (falling, collision, injury risk)
    CROSSING = "crossing"          # At intersection, need traffic signal info
    READING = "reading"            # Text detected, offer to read or auto-read
    STAIRS = "stairs"              # Stairs detected, up/down navigation
    DOOR = "door"                  # Doorway detected, entering/exiting
    QUEUE = "queue"                # Line/queue detected, waiting context
    PUBLIC_TRANSPORT = "transport" # Bus, train, station - mobility context
    OBSTACLE = "obstacle"          # Minor obstacles to navigate around
    IDLE = "idle"                  # Safe, no threats, nothing immediate


class ContextIndicators:
    """Detect real-world context from detections to inform mode inference."""
    
    @staticmethod
    def detect_navigation_context(detections: List[Detection]) -> Dict[str, bool]:
        """Detect if user is actively navigating."""
        if not detections:
            return {"is_navigating": False, "obstacles_count": 0}
        
        # Count navigation-relevant objects
        nav_objects = {"person", "car", "bike", "motorcycle", "pole", "post", 
                       "bench", "chair", "fire hydrant", "plant", "stop sign"}
        nav_count = sum(1 for d in detections if d.label.lower() in nav_objects)
        
        return {
            "is_navigating": nav_count > 0,
            "obstacles_count": nav_count,
            "avg_distance_m": sum(d.distance_est_m or 5.0 for d in detections) / len(detections)
        }
    
    @staticmethod
    def detect_hazards(detections: List[Detection]) -> Dict[str, any]:
        """Detect potential hazards (collision risk, sharp objects, etc)."""
        hazard_objects = {
            "car": {"risk": "collision", "priority": 10},
            "bicycle": {"risk": "collision", "priority": 8},
            "motorcycle": {"risk": "collision", "priority": 9},
            "person": {"risk": "collision", "priority": 5},
            "knife": {"risk": "injury", "priority": 10},
            "scissors": {"risk": "injury", "priority": 10},
            "bus": {"risk": "large moving object", "priority": 9},
            "truck": {"risk": "large moving object", "priority": 9},
        }
        
        hazards = []
        for detection in detections:
            if detection.label.lower() in hazard_objects:
                distance_m = detection.distance_est_m or 999
                # Only critical if close (< 2 meters)
                if distance_m < 2.0:
                    hazard_info = hazard_objects[detection.label.lower()].copy()
                    hazard_info.update({
                        "label": detection.label,
                        "distance_m": distance_m,
                        "zone": detection.zone,
                    })
                    hazards.append(hazard_info)
        
        return {
            "has_hazard": len(hazards) > 0,
            "hazards": sorted(hazards, key=lambda h: h["priority"], reverse=True),
            "most_urgent": hazards[0] if hazards else None,
        }
    
    @staticmethod
    def detect_stairs(detections: List[Detection]) -> Dict[str, any]:
        """Detect stairs (currently no direct class, infer from geometry)."""
        # In practice: check for patterns, shadows, or use depth
        # For now: simple heuristic
        stair_keywords = ["step", "stair", "stairs", "stairs"]  # OCR can help
        
        for detection in detections:
            if any(kw in detection.label.lower() for kw in stair_keywords):
                return {
                    "has_stairs": True,
                    "type": detection.label,
                    "direction": "down" if "down" in detection.label else "up",
                }
        
        return {"has_stairs": False}
    
    @staticmethod
    def detect_doors(detections: List[Detection]) -> Dict[str, any]:
        """Detect doors and entrances."""
        door_objects = {"door", "entrance", "exit", "gate", "doorway"}
        
        doors = [d for d in detections if d.label.lower() in door_objects]
        
        if doors:
            # Pick closest door
            closest = min(doors, key=lambda d: d.distance_est_m or 999)
            return {
                "has_door": True,
                "distance_m": closest.distance_est_m,
                "zone": closest.zone,
                "type": closest.label,
            }
        
        return {"has_door": False}
    
    @staticmethod
    def detect_traffic_light(detections: List[Detection]) -> Optional[Detection]:
        """Detect traffic light for street crossing."""
        for d in detections:
            if d.label.lower() == "traffic light":
                return d
        return None
    
    @staticmethod
    def detect_public_transport(detections: List[Detection]) -> Dict[str, any]:
        """Detect buses, trains, stations."""
        transport_labels = {"bus", "train", "subway", "platform"}
        
        for detection in detections:
            if detection.label.lower() in transport_labels:
                return {
                    "transport_type": detection.label,
                    "distance_m": detection.distance_est_m,
                    "zone": detection.zone,
                }
        
        return {}
    
    @staticmethod
    def detect_queues(detections: List[Detection]) -> bool:
        """Detect if objects suggest a queue (multiple people in line pattern)."""
        people = [d for d in detections if d.label.lower() == "person"]
        
        if len(people) >= 2:
            # Simple heuristic: people in similar zones = queue
            zones = [p.zone for p in people]
            if zones.count(zones[0]) >= 2:
                return True
        
        return False
    
    @staticmethod
    def detect_text_context(detections: List[Detection]) -> bool:
        """Check if signs or readable text likely present."""
        text_objects = {"sign", "poster", "label", "book", "newspaper", "menu",
                        "screen", "display", "building number", "street sign"}
        
        return any(d.label.lower() in text_objects for d in detections)


class DecisionEngine:
    """
    Context-aware decision maker for autonomous blind user assistance.
    
    Converts raw detections into speech output decisions automatically.
    Rules:
    - Never expose mode to user (automatic internally)
    - Generate short, actionable phrases only (3-9 words)
    - Prioritize safety (hazards > navigation > idle)
    - Avoid repetition (dedup window, phrase memory)
    - Stay silent when nothing pressing (let user focus)
    """
    
    def __init__(self):
        self.last_mode: Optional[InferredMode] = None
        self.mode_change_time = time.time()
        self.silence_until = 0  # Timestamp when to allow next speech
        self.detection_dedup: Dict[str, float] = defaultdict(float)
        self.recent_spoken_phrases: deque = deque(maxlen=15)
        self.object_last_spoken: Dict[str, float] = defaultdict(float)
        self.context = ContextIndicators()
    
    def infer_mode(
        self,
        detections: List[Detection],
        context: Optional[Dict] = None
    ) -> InferredMode:
        """
        Infer active mode from detections and context.
        
        Decision priority:
        1. HAZARD - immediate danger (collision, falling, injury)
        2. STAIRS - stairs detected
        3. CROSSING - traffic light or street crossing context
        4. DOOR - doorway/entrance detected
        5. PUBLIC_TRANSPORT - bus/train/station
        6. QUEUE - line of people detected
        7. READING - text/signs detected
        8. OBSTACLE - minor obstacles in path
        9. NAVIGATION - general movement obstacles
        10. IDLE - nothing relevant
        """
        context = context or {}
        
        if not detections:
            return InferredMode.IDLE
        
        # Check hazards first (highest priority)
        hazard_info = self.context.detect_hazards(detections)
        if hazard_info["has_hazard"]:
            return InferredMode.HAZARD
        
        # Check stairs
        stair_info = self.context.detect_stairs(detections)
        if stair_info["has_stairs"]:
            return InferredMode.STAIRS
        
        # Check traffic light (crossing context)
        if self.context.detect_traffic_light(detections):
            return InferredMode.CROSSING
        
        # Check doors
        if self.context.detect_doors(detections)["has_door"]:
            return InferredMode.DOOR
        
        # Check public transport
        if self.context.detect_public_transport(detections):
            return InferredMode.PUBLIC_TRANSPORT
        
        # Check queues
        if self.context.detect_queues(detections):
            return InferredMode.QUEUE
        
        # Check for readable text
        if self.context.detect_text_context(detections):
            return InferredMode.READING
        
        # Check navigation obstacles
        nav_context = self.context.detect_navigation_context(detections)
        if nav_context["is_navigating"] and nav_context["obstacles_count"] > 0:
            return InferredMode.OBSTACLE
        
        if nav_context["is_navigating"]:
            return InferredMode.NAVIGATION
        
        return InferredMode.IDLE
    
    def filter_redundant(
        self,
        detections: List[Detection],
        dedup_window: float = 4.0
    ) -> List[Detection]:
        """
        Remove duplicate or near-duplicate detections within a time window.
        Prevents "car car car" spam.
        """
        now = time.time()
        filtered = []
        
        for detection in detections:
            # Create dedup key from detection characteristics
            dedup_key = f"{detection.label}_{detection.zone}"
            time_since = now - self.detection_dedup.get(dedup_key, 0)
            
            if time_since > dedup_window:
                filtered.append(detection)
                self.detection_dedup[dedup_key] = now
            else:
                logger.debug(f"Filtered duplicate: {dedup_key}")
        
        return filtered
    
    def apply_post_speech_silence(
        self,
        detections: List[Detection],
        silence_duration: float = 2.5
    ) -> List[Detection]:
        """
        After speaking, silence for N seconds to let user process/respond.
        Prevents overwhelming user with constant speech.
        """
        now = time.time()
        
        if now < self.silence_until:
            logger.debug(f"In silence window (until {self.silence_until:.1f}s)")
            return []
        
        return detections
    
    def should_speak_about_object(
        self,
        label: str,
        last_spoken_threshold: float = 3.0
    ) -> bool:
        """
        Determine if we should speak about this object again.
        Avoids: "person ahead" repeated every 500ms.
        """
        now = time.time()
        last_spoken = self.object_last_spoken.get(label, 0)
        time_since = now - last_spoken
        
        return time_since > last_spoken_threshold
    
    def decide_speech(
        self,
        detections: List[Detection],
        context: Optional[Dict] = None
    ) -> Tuple[Optional[str], InferredMode]:
        """
        Main decision function: given detections, decide what (if anything) to say.
        
        Returns:
            (phrase_to_speak, active_mode)
            phrase_to_speak is None if should be silent.
        """
        context = context or {}
        now = time.time()
        
        # 1. Filter redundant detections
        filtered = self.filter_redundant(detections)
        
        # 2. Check silence window
        filtered = self.apply_post_speech_silence(filtered)
        
        # 3. Infer mode
        mode = self.infer_mode(filtered, context)
        
        # 4. Select what to speak based on mode
        phrase = None
        
        if filtered:
            # Pick most relevant detection for this mode
            detection = self._select_detection_for_mode(filtered, mode)
            
            if detection and self.should_speak_about_object(detection.label):
                phrase = self._generate_phrase(detection, mode)
                
                # Record silence window for after speech
                self.silence_until = now + 2.5
                self.object_last_spoken[detection.label] = now
                self.recent_spoken_phrases.append(phrase)
                logger.info(f"Decision: SPEAK '{phrase}' (mode={mode})")
            else:
                logger.debug(f"Decision: SILENT (object cooldown)")
        else:
            logger.debug(f"Decision: SILENT (mode={mode})")
        
        self.last_mode = mode
        return phrase, mode
    
    def _select_detection_for_mode(
        self,
        detections: List[Detection],
        mode: InferredMode
    ) -> Optional[Detection]:
        """Select most relevant detection for the current mode."""
        if not detections:
            return None
        
        # Sort by distance (closest first = most relevant)
        sorted_dets = sorted(detections, key=lambda d: d.distance_est_m or 999)
        
        if mode == InferredMode.HAZARD:
            # For hazards, pick closest
            return sorted_dets[0]
        elif mode == InferredMode.STAIRS:
            # Stairs - any stairs detection
            stairs = [d for d in sorted_dets 
                     if "stair" in d.label.lower()]
            return stairs[0] if stairs else sorted_dets[0]
        elif mode == InferredMode.DOOR:
            # Door - any door
            doors = [d for d in sorted_dets 
                    if d.label.lower() in {"door", "gate", "entrance", "exit"}]
            return doors[0] if doors else sorted_dets[0]
        elif mode == InferredMode.CROSSING:
            # Traffic light
            lights = [d for d in sorted_dets if d.label.lower() == "traffic light"]
            return lights[0] if lights else sorted_dets[0]
        else:
            # Default: closest, most relevant object
            return sorted_dets[0]
    
    def _generate_phrase(
        self,
        detection: Detection,
        mode: InferredMode
    ) -> str:
        """
        Generate short, actionable phrase for detection.
        
        Output rules (for blind users):
        - 3-9 words maximum
        - Format: [label] [direction] [action]
        - Action verb (avoid, move, stop, go, step, hold, listen)
        - Natural language, no jargon
        """
        label = detection.label.lower()
        direction = detection.zone or "center"
        distance = detection.distance_est_m
        distance_word = self._distance_to_word(distance)
        
        # Mode-specific phrase generation
        if mode == InferredMode.HAZARD:
            return self._phrase_hazard(label, direction, distance_word)
        elif mode == InferredMode.STAIRS:
            return self._phrase_stairs(label)
        elif mode == InferredMode.DOOR:
            return f"Door ahead, {self._direction_action(direction)}"
        elif mode == InferredMode.CROSSING:
            return self._phrase_crossing(label)
        elif mode == InferredMode.PUBLIC_TRANSPORT:
            return self._phrase_transport(label)
        elif mode == InferredMode.QUEUE:
            return "People in line ahead"
        elif mode == InferredMode.READING:
            return "Text found, want me to read?"
        elif mode == InferredMode.OBSTACLE:
            return self._phrase_obstacle(label, direction)
        elif mode == InferredMode.NAVIGATION:
            return self._phrase_navigation(label, direction, distance_word)
        else:
            return f"{label.title()}, {direction}"
    
    def _distance_to_word(self, distance_m: Optional[float]) -> str:
        """Convert distance to natural language word."""
        if distance_m is None:
            return "nearby"
        elif distance_m < 0.5:
            return "very close"
        elif distance_m < 1.0:
            return "close"
        elif distance_m < 2.0:
            return "ahead"
        elif distance_m < 5.0:
            return "far"
        else:
            return "far away"
    
    def _direction_action(self, direction: str) -> str:
        """Suggest action for direction."""
        if direction == "left":
            return "move right"
        elif direction == "right":
            return "move left"
        else:
            return "in your path"
    
    def _phrase_hazard(self, label: str, direction: str, distance: str) -> str:
        """Generate urgent hazard phrase."""
        if distance in ["very close", "close"]:
            return f"{label} {distance}, stop!"
        else:
            return f"{label} ahead, {self._direction_action(direction)}"
    
    def _phrase_stairs(self, label: str) -> str:
        """Generate stairs phrase."""
        if "down" in label.lower():
            return "Stairs going down, hold railing"
        elif "up" in label.lower():
            return "Stairs going up, hold railing"
        else:
            return "Stairs ahead, be careful"
    
    def _phrase_crossing(self, label: str) -> str:
        """Generate street crossing phrase."""
        # Would need OCR or additional context to read signal
        return "Traffic light ahead, wait for green"
    
    def _phrase_transport(self, label: str) -> str:
        """Generate public transport phrase."""
        return f"{label.title()} approaching, step back"
    
    def _phrase_obstacle(self, label: str, direction: str) -> str:
        """Generate obstacle avoidance phrase."""
        if direction == "center":
            return f"{label} in path, go around"
        else:
            return f"{label} {direction}, {self._direction_action(direction)}"
    
    def _phrase_navigation(self, label: str, direction: str, distance: str) -> str:
        """Generate general navigation phrase."""
        if direction == "center":
            return f"{label} {distance}, step aside"
        else:
            return f"{label} {direction}"
    
    def get_mode_context(self, mode: InferredMode) -> Dict:
        """
        Return behavior hints based on active mode.
        Used by reasoning agent to adjust behavior.
        (This is internal; never exposed to user.)
        """
        return {
            "navigation": {
                "focus": "obstacle avoidance and collision prevention",
                "urgency": "normal",
                "allow_pauses": True,
            },
            "hazard": {
                "focus": "immediate danger - prioritize urgent warning",
                "urgency": "critical",
                "allow_pauses": False,
            },
            "crossing": {
                "focus": "safe street crossing - respect traffic signals",
                "urgency": "critical",
                "allow_pauses": False,
            },
            "stairs": {
                "focus": "stairs navigation - safety and directional info",
                "urgency": "high",
                "allow_pauses": False,
            },
            "door": {
                "focus": "door/entrance navigation",
                "urgency": "normal",
                "allow_pauses": True,
            },
            "reading": {
                "focus": "text reading - offer support, let user decide",
                "urgency": "low",
                "allow_pauses": True,
            },
            "queue": {
                "focus": "queue/line awareness",
                "urgency": "low",
                "allow_pauses": True,
            },
            "public_transport": {
                "focus": "bus/train navigation",
                "urgency": "high",
                "allow_pauses": False,
            },
            "idle": {
                "focus": "stay silent, let user focus",
                "urgency": "none",
                "allow_pauses": True,
            },
        }.get(mode.value, {})
                "patience": "relaxed",
            },
        }.get(mode.value, {})


# Singleton
_engine: Optional[DecisionEngine] = None


def get_decision_engine() -> DecisionEngine:
    """Get the singleton decision engine."""
    global _engine
    if _engine is None:
        _engine = DecisionEngine()
    return _engine

