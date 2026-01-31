/**
 * StatusBar Component
 * Shows system status indicators.
 */

import React from 'react';
import './StatusBar.css';

function StatusBar({ isStreaming, isRunning, isProcessing, latency, isSpeaking }) {
  return (
    <div className="status-bar">
      {/* Camera Status */}
      <div className={`status-item ${isStreaming ? 'active' : ''}`}>
        <span className="status-dot"></span>
        <span className="status-label">Camera</span>
      </div>
      
      {/* Live Mode Status */}
      <div className={`status-item ${isRunning ? 'active live' : ''}`}>
        <span className="status-dot"></span>
        <span className="status-label">Live</span>
      </div>
      
      {/* Processing Indicator */}
      {isProcessing && (
        <div className="status-item processing">
          <span className="status-spinner">⟳</span>
          <span className="status-label">AI</span>
        </div>
      )}
      
      {/* Speaking Indicator */}
      {isSpeaking && (
        <div className="status-item speaking">
          <span className="status-icon">🔊</span>
          <span className="status-label">Speaking</span>
        </div>
      )}
      
      {/* Latency */}
      {latency > 0 && (
        <div className={`status-item latency ${latency > 2000 ? 'warning' : ''}`}>
          <span className="status-value">{Math.round(latency)}ms</span>
          <span className="status-label">Latency</span>
        </div>
      )}
    </div>
  );
}

export default StatusBar;
