"""
IOU-based Object Tracker
Simple but effective multi-object tracking for consistent object IDs.
"""

import time
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import numpy as np

from app.models import Detection, BoundingBox, TrackedObject


logger = logging.getLogger(__name__)


@dataclass
class TrackState:
    """Internal state for a tracked object."""
    id: int
    label: str
    bbox: BoundingBox
    confidence: float
    
    # History for smoothing
    bbox_history: List[BoundingBox] = field(default_factory=list)
    
    # Timing
    first_seen_at: float = 0.0
    last_seen_at: float = 0.0
    last_spoken_at: Optional[float] = None
    
    # Motion estimation
    velocity_x: float = 0.0
    velocity_y: float = 0.0
    
    # Tracking metadata
    frames_seen: int = 1
    frames_missing: int = 0
    
    def update_bbox(self, new_bbox: BoundingBox, timestamp: float) -> None:
        """Update bounding box with smoothing and velocity estimation."""
        # Estimate velocity from center movement
        dt = timestamp - self.last_seen_at if self.last_seen_at > 0 else 0.1
        if dt > 0:
            old_cx, old_cy = self.bbox.center_x, self.bbox.center_y
            new_cx, new_cy = new_bbox.center_x, new_bbox.center_y
            
            # Exponential moving average for velocity
            alpha = 0.3
            new_vx = (new_cx - old_cx) / dt
            new_vy = (new_cy - old_cy) / dt
            self.velocity_x = alpha * new_vx + (1 - alpha) * self.velocity_x
            self.velocity_y = alpha * new_vy + (1 - alpha) * self.velocity_y
        
        # Smooth bounding box with EMA
        smooth_alpha = 0.5
        self.bbox = BoundingBox(
            x1=smooth_alpha * new_bbox.x1 + (1 - smooth_alpha) * self.bbox.x1,
            y1=smooth_alpha * new_bbox.y1 + (1 - smooth_alpha) * self.bbox.y1,
            x2=smooth_alpha * new_bbox.x2 + (1 - smooth_alpha) * self.bbox.x2,
            y2=smooth_alpha * new_bbox.y2 + (1 - smooth_alpha) * self.bbox.y2,
        )
        
        self.last_seen_at = timestamp
        self.frames_seen += 1
        self.frames_missing = 0
    
    @property
    def is_approaching(self) -> bool:
        """Check if object is moving toward camera (bbox growing)."""
        # Positive velocity_y means moving down = approaching
        # Large positive velocity indicates approach
        return self.velocity_y > 0.05 or self.bbox.area > 0.15
    
    def to_tracked_object(self) -> TrackedObject:
        """Convert to API model."""
        return TrackedObject(
            id=self.id,
            label=self.label,
            confidence=self.confidence,
            bbox=self.bbox,
            velocity_x=self.velocity_x,
            velocity_y=self.velocity_y,
            is_approaching=self.is_approaching,
            frames_seen=self.frames_seen,
            last_spoken_at=self.last_spoken_at,
        )


def compute_iou(box1: BoundingBox, box2: BoundingBox) -> float:
    """Compute Intersection over Union between two bounding boxes."""
    # Intersection
    x1 = max(box1.x1, box2.x1)
    y1 = max(box1.y1, box2.y1)
    x2 = min(box1.x2, box2.x2)
    y2 = min(box1.y2, box2.y2)
    
    if x2 <= x1 or y2 <= y1:
        return 0.0
    
    intersection = (x2 - x1) * (y2 - y1)
    union = box1.area + box2.area - intersection
    
    return intersection / union if union > 0 else 0.0


class ObjectTracker:
    """
    Simple IOU-based multi-object tracker.
    
    Design rationale:
    - IOU matching is simple, fast, and sufficient for 1-5 FPS
    - No deep learning overhead (SORT/DeepSORT would add latency)
    - Maintains object identity for cooldown enforcement
    - Tracks velocity for approach detection
    
    Algorithm:
    1. Compute IOU matrix between existing tracks and new detections
    2. Greedy match by highest IOU (threshold 0.3)
    3. Unmatched detections become new tracks
    4. Tracks missing for N frames are deleted
    """
    
    def __init__(
        self,
        iou_threshold: float = 0.3,
        max_frames_missing: int = 10,
        max_tracks: int = 50
    ):
        self.iou_threshold = iou_threshold
        self.max_frames_missing = max_frames_missing
        self.max_tracks = max_tracks
        
        self.tracks: Dict[int, TrackState] = {}
        self.next_id = 1
    
    def reset(self) -> None:
        """Reset all tracks."""
        self.tracks.clear()
        self.next_id = 1
    
    def update(
        self,
        detections: List[Detection],
        timestamp: float
    ) -> List[TrackedObject]:
        """
        Update tracks with new detections.
        
        Args:
            detections: List of detections from current frame
            timestamp: Current frame timestamp
            
        Returns:
            List of tracked objects with persistent IDs
        """
        if not detections:
            # Mark all tracks as missing
            for track in self.tracks.values():
                track.frames_missing += 1
            self._prune_tracks()
            return []
        
        # Build cost matrix (negative IOU for assignment)
        track_ids = list(self.tracks.keys())
        n_tracks = len(track_ids)
        n_dets = len(detections)
        
        if n_tracks == 0:
            # All detections become new tracks
            return self._create_tracks(detections, timestamp)
        
        # Compute IOU matrix
        iou_matrix = np.zeros((n_tracks, n_dets))
        for i, tid in enumerate(track_ids):
            track = self.tracks[tid]
            for j, det in enumerate(detections):
                # Only match same class
                if track.label == det.label:
                    iou_matrix[i, j] = compute_iou(track.bbox, det.bbox)
        
        # Greedy matching
        matched_tracks = set()
        matched_dets = set()
        matches: List[Tuple[int, int]] = []
        
        # Sort by IOU descending
        indices = np.dstack(np.unravel_index(
            np.argsort(iou_matrix.ravel())[::-1], 
            iou_matrix.shape
        ))[0]
        
        for i, j in indices:
            if i in matched_tracks or j in matched_dets:
                continue
            if iou_matrix[i, j] < self.iou_threshold:
                continue
            
            matches.append((track_ids[i], j))
            matched_tracks.add(i)
            matched_dets.add(j)
        
        # Update matched tracks
        for track_id, det_idx in matches:
            det = detections[det_idx]
            track = self.tracks[track_id]
            track.update_bbox(det.bbox, timestamp)
            track.confidence = det.confidence
        
        # Mark unmatched tracks as missing
        for i, tid in enumerate(track_ids):
            if i not in matched_tracks:
                self.tracks[tid].frames_missing += 1
        
        # Create new tracks for unmatched detections
        for j, det in enumerate(detections):
            if j not in matched_dets:
                self._create_track(det, timestamp)
        
        # Prune old tracks
        self._prune_tracks()
        
        # Return all active tracks
        result = []
        for track in self.tracks.values():
            tracked = track.to_tracked_object()
            # Attach track_id to original detection for reference
            result.append(tracked)
        
        return result
    
    def _create_track(self, detection: Detection, timestamp: float) -> TrackState:
        """Create a new track from a detection."""
        if len(self.tracks) >= self.max_tracks:
            # Remove oldest track
            oldest_id = min(self.tracks.keys(), key=lambda k: self.tracks[k].last_seen_at)
            del self.tracks[oldest_id]
        
        track = TrackState(
            id=self.next_id,
            label=detection.label,
            bbox=detection.bbox,
            confidence=detection.confidence,
            first_seen_at=timestamp,
            last_seen_at=timestamp,
        )
        self.tracks[self.next_id] = track
        self.next_id += 1
        return track
    
    def _create_tracks(
        self,
        detections: List[Detection],
        timestamp: float
    ) -> List[TrackedObject]:
        """Create tracks for all detections."""
        result = []
        for det in detections:
            track = self._create_track(det, timestamp)
            result.append(track.to_tracked_object())
        return result
    
    def _prune_tracks(self) -> None:
        """Remove tracks that have been missing too long."""
        to_remove = [
            tid for tid, track in self.tracks.items()
            if track.frames_missing > self.max_frames_missing
        ]
        for tid in to_remove:
            del self.tracks[tid]
    
    def get_track(self, track_id: int) -> Optional[TrackState]:
        """Get a track by ID."""
        return self.tracks.get(track_id)
    
    def mark_spoken(self, track_id: int, timestamp: float) -> None:
        """Mark a track as having been spoken about."""
        if track_id in self.tracks:
            self.tracks[track_id].last_spoken_at = timestamp


# Singleton instance
_tracker: Optional[ObjectTracker] = None


def get_tracker() -> ObjectTracker:
    """Get the singleton tracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = ObjectTracker()
    return _tracker
