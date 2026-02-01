/**
 * ControlPanel Component
 * Essential controls for autonomous assistive vision.
 * 
 * Shown controls:
 * - Camera start/stop
 * - Assist start/stop (no mode selection, fully automatic)
 * - Mute toggle
 * - Settings
 * 
 * Removed:
 * - Mode selection buttons (automatic)
 * - Quick phrases (generated dynamically)
 * - Manual actions (all automatic)
 */

import React from 'react';
import './ControlPanel.css';

function ControlPanel({
  isLiveRunning,
  isStreaming,
  onStartLive,
  onStopLive,
  onStartCamera,
  onStopCamera,
  muted,
  setMuted,
  isProcessing,
  isSpeaking
}) {
  return (
    <div className="control-panel">
      {/* Camera Controls */}
      <div className="control-group">
        <h3 className="control-group-title">Camera</h3>
        {!isStreaming ? (
          <button
            className="btn btn-primary btn-large"
            onClick={onStartCamera}
            aria-label="Start camera"
          >
            📷 Start Camera
          </button>
        ) : (
          <button
            className="btn btn-danger btn-large"
            onClick={onStopCamera}
            disabled={isLiveRunning}
            aria-label="Stop camera"
          >
            ⏹️ Stop Camera
          </button>
        )}
      </div>
      
      {/* Assist Control */}
      <div className="control-group">
        <h3 className="control-group-title">Assist</h3>
        
        {/* Automatic Assist (always-on when enabled) */}
        {
          !isLiveRunning ? (
            <button
              className="btn btn-primary btn-large"
              onClick={onStartLive}
              disabled={!isStreaming}
              aria-label="Start live assist"
            >
              ▶️ Start Live Assist
            </button>
          ) : (
            <div className="live-status">
              <button
                className="btn btn-danger btn-large"
                onClick={onStopLive}
                aria-label="Stop live assist"
              >
                ⏹️ Stop
              </button>
              <div className="status-indicator">
                {isProcessing ? (
                  <span className="processing">🔄 Analyzing...</span>
                ) : isSpeaking ? (
                  <span className="speaking">🔊 Speaking...</span>
                ) : (
                  <span className="ready">✓ Ready</span>
                )}
              </div>
            </div>
          )
        }
      </div>
      
      {/* Settings */}
      <div className="control-group">
        <h3 className="control-group-title">Settings</h3>
        
        {/* Mute Toggle */}
        <div className="setting-row">
          <label htmlFor="mute-toggle">Audio</label>
          <button
            id="mute-toggle"
            className={`toggle-button ${muted ? 'off' : 'on'}`}
            onClick={() => setMuted(!muted)}
            aria-pressed={!muted}
          >
            {muted ? '🔇 Muted' : '🔊 On'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ControlPanel;
