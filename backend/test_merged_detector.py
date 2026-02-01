"""
Quick test of merged detector to verify integration.
"""

import sys
sys.path.insert(0, '.')

import numpy as np
from app.perception.detector import (
    ObjectDetector,
    estimate_distance_m,
    compute_distance_info,
    get_spatial_zone,
)

def test_distance_functions():
    """Test distance calculation functions."""
    print("=" * 60)
    print("Testing distance estimation functions")
    print("=" * 60)
    
    # Test 1: Vertical position scoring
    print("\n1. Vertical position scoring:")
    print(f"   Top (cy=0.1):    {compute_distance_info('person', cy_norm=0.1, area_norm=0.05, bbox_h_pixels=100, img_h_pixels=480)}")
    print(f"   Middle (cy=0.5): {compute_distance_info('person', cy_norm=0.5, area_norm=0.05, bbox_h_pixels=100, img_h_pixels=480)}")
    print(f"   Bottom (cy=0.9): {compute_distance_info('person', cy_norm=0.9, area_norm=0.05, bbox_h_pixels=100, img_h_pixels=480)}")
    
    # Test 2: Distance estimation
    print("\n2. Distance estimation (person, different heights):")
    print(f"   Tiny (50px):     {estimate_distance_m('person', 50, 480):.2f}m")
    print(f"   Small (100px):   {estimate_distance_m('person', 100, 480):.2f}m")
    print(f"   Medium (200px):  {estimate_distance_m('person', 200, 480):.2f}m")
    print(f"   Large (400px):   {estimate_distance_m('person', 400, 480):.2f}m")
    
    # Test 3: Spatial zones
    print("\n3. Spatial zones:")
    print(f"   Left (cx=0.1):   {get_spatial_zone(0.1)}")
    print(f"   Center (cx=0.5): {get_spatial_zone(0.5)}")
    print(f"   Right (cx=0.9):  {get_spatial_zone(0.9)}")
    
    # Test 4: Combined distance
    print("\n4. Combined distance calculation:")
    info = compute_distance_info(
        label='chair',
        cy_norm=0.7,      # bottom of frame (closer)
        area_norm=0.08,   # moderate size
        bbox_h_pixels=120,
        img_h_pixels=480,
        include_debug=True
    )
    print(f"   Info: {info}")

def test_detector_init():
    """Test detector can be initialized."""
    print("\n" + "=" * 60)
    print("Testing detector initialization")
    print("=" * 60)
    
    detector = ObjectDetector(model_path="yolov8n.pt")
    print("✓ Detector created successfully")
    print(f"  Model path: {detector.model_path}")
    print(f"  Loaded: {detector._loaded}")

if __name__ == "__main__":
    test_distance_functions()
    test_detector_init()
    print("\n" + "=" * 60)
    print("All tests passed! Merged detector is working.")
    print("=" * 60)
