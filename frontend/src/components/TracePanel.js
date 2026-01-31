/**
 * TracePanel Component
 * Shows scene understanding trace for judges/debugging.
 * 
 * Updated for narrative mode:
 * - Shows last narrative and timing
 * - Displays object count and detection info
 * - Removed old gate-based display
 */

import React from 'react';
import './TracePanel.css';

function TracePanel({ trace, lastNarrative, detections, isLiveRunning }) {
  return (
    <div className="trace-panel">
      <h3 className="trace-title">🔍 Vision Trace</h3>
      
      {/* Status */}
      <div className="trace-section">
        <h4 className="trace-section-title">Status</h4>
        <div className={`trace-status ${isLiveRunning ? 'live' : 'idle'}`}>
          <span className="status-icon">
            {isLiveRunning ? '🔴' : '⚪'}
          </span>
          <span className="status-text">
            {isLiveRunning ? 'Live Mode Active' : 'Idle'}
          </span>
        </div>
      </div>
      
      {/* Last Narrative */}
      {lastNarrative && (
        <div className="trace-section">
          <h4 className="trace-section-title">Last Narrative</h4>
          <div className="trace-narrative">
            "{lastNarrative}"
          </div>
        </div>
      )}
      
      {/* Timing */}
      {trace?.timing && (
        <div className="trace-section">
          <h4 className="trace-section-title">Timing</h4>
          <div className="trace-timing">
            <div className="timing-row">
              <span className="timing-label">Detection:</span>
              <span className="timing-value">{trace.timing.detection_ms?.toFixed(0) || 0}ms</span>
            </div>
            <div className="timing-row">
              <span className="timing-label">LLM (Vision):</span>
              <span className="timing-value">{trace.timing.llm_ms?.toFixed(0) || 0}ms</span>
            </div>
            <div className="timing-row total">
              <span className="timing-label">Total:</span>
              <span className="timing-value">{trace.timing.total_ms?.toFixed(0) || 0}ms</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Detected Objects */}
      <div className="trace-section">
        <h4 className="trace-section-title">Detected Objects ({detections?.length || 0})</h4>
        {detections && detections.length > 0 ? (
          <div className="trace-objects">
            {/* Group objects by label */}
            {Object.entries(
              detections.reduce((acc, det) => {
                acc[det.label] = (acc[det.label] || 0) + 1;
                return acc;
              }, {})
            ).map(([label, count]) => (
              <div key={label} className="trace-object">
                <span className="object-label">{label}</span>
                <span className="object-count">×{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="trace-empty">No objects detected</p>
        )}
      </div>
      
      {/* Detection Pipeline Info */}
      <div className="trace-section">
        <h4 className="trace-section-title">Pipeline</h4>
        <div className="trace-pipeline">
          <div className="pipeline-step">
            <span className="step-icon">📷</span>
            <span className="step-name">Capture</span>
          </div>
          <span className="pipeline-arrow">→</span>
          <div className="pipeline-step">
            <span className="step-icon">🎯</span>
            <span className="step-name">YOLO</span>
          </div>
          <span className="pipeline-arrow">→</span>
          <div className="pipeline-step">
            <span className="step-icon">🧠</span>
            <span className="step-name">Claude Vision</span>
          </div>
          <span className="pipeline-arrow">→</span>
          <div className="pipeline-step">
            <span className="step-icon">🔊</span>
            <span className="step-name">TTS</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TracePanel;
