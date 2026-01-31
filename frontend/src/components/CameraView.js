/**
 * CameraView Component
 * Displays webcam feed with bounding box overlay for detected objects.
 */

import React, { useEffect, useRef } from 'react';
import './CameraView.css';

// Color mapping for different object classes
const LABEL_COLORS = {
  person: '#4da6ff',
  car: '#ef4444',
  bike: '#f59e0b',
  dog: '#a855f7',
  chair: '#22c55e',
  door: '#06b6d4',
  stairs: '#ec4899',
};

function CameraView({ videoRef, canvasRef, detections, isStreaming, error }) {
  const overlayRef = useRef(null);
  
  // Draw bounding boxes on canvas overlay
  useEffect(() => {
    if (!overlayRef.current || !videoRef.current) return;
    
    const canvas = overlayRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    // Match canvas size to video
    if (video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!detections || detections.length === 0) return;
    
    // Draw each detection
    detections.forEach((det) => {
      const color = LABEL_COLORS[det.label] || '#ffffff';
      const bbox = det.bbox;
      
      // Convert normalized coordinates to pixels
      const x = bbox.x1 * canvas.width;
      const y = bbox.y1 * canvas.height;
      const width = (bbox.x2 - bbox.x1) * canvas.width;
      const height = (bbox.y2 - bbox.y1) * canvas.height;
      
      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      // Draw label background
      const label = `${det.label} ${Math.round(det.confidence * 100)}%`;
      ctx.font = 'bold 16px Inter, sans-serif';
      const textWidth = ctx.measureText(label).width;
      const textHeight = 20;
      const padding = 4;
      
      ctx.fillStyle = color;
      ctx.fillRect(
        x - 1,
        y - textHeight - padding * 2,
        textWidth + padding * 2,
        textHeight + padding * 2
      );
      
      // Draw label text
      ctx.fillStyle = '#000000';
      ctx.fillText(label, x + padding, y - padding - 4);
      
      // Draw track ID if available
      if (det.track_id) {
        ctx.font = '12px Inter, sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(`ID: ${det.track_id}`, x + 4, y + 16);
      }
    });
  }, [detections, videoRef]);
  
  return (
    <div className="camera-view">
      {/* Error message */}
      {error && (
        <div className="camera-error" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}
      
      {/* Video element */}
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        aria-label="Camera feed"
      />
      
      {/* Overlay canvas for bounding boxes */}
      <canvas
        ref={overlayRef}
        className="camera-overlay"
        aria-hidden="true"
      />
      
      {/* Placeholder when not streaming */}
      {!isStreaming && !error && (
        <div className="camera-placeholder">
          <div className="placeholder-icon">📷</div>
          <p>Click "Start Camera" to begin</p>
        </div>
      )}
      
      {/* Detection count badge */}
      {isStreaming && detections && detections.length > 0 && (
        <div className="detection-badge" aria-live="polite">
          {detections.length} object{detections.length !== 1 ? 's' : ''} detected
        </div>
      )}
    </div>
  );
}

export default CameraView;
