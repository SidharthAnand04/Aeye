"""
DEPRECATED: This module has been merged into detector.py

All functionality from VisionDetector and distance estimation has been
integrated into the unified ObjectDetector in detector.py.

Migration guide:
- Old: from app.perception.detector2 import VisionDetector
- New: from app.perception.detector import ObjectDetector, get_detector()

All distance estimation, spatial awareness, and debugging features
are now available in the main detector.py module.

Key improvements in the merged detector:
1. Clean, maintainable architecture (single file)
2. Preserved all distance estimation logic (critical for blind user safety)
3. Integrated spatial zone detection (left/center/right for TTS)
4. Added support for debug information via include_debug parameter
5. Sorted detections by distance (closest first - most dangerous)
6. Maintained backward compatibility with existing API

This file is kept for reference only and will be removed in the next release.
For any issues, contact the development team.
"""

import warnings

warnings.warn(
    "detector2 module is deprecated and merged into detector. "
    "Use 'from app.perception.detector import ObjectDetector, get_detector()' instead.",
    DeprecationWarning,
    stacklevel=2
)

        return "right"
    return "center"


# =============================================================
# LEGACY IMPLEMENTATION - MOVED TO detector.py
# =============================================================
# The following functions and classes are deprecated.
# They have been integrated into detector.py with improved architecture.
#
# For backward compatibility, you can import from detector.py:
#   from app.perception.detector import ObjectDetector, get_detector
#   from app.perception.detector import compute_distance_info
#   from app.perception.detector import get_spatial_zone
#
# Contact the development team if you have any migration questions.
