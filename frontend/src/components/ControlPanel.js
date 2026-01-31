/**
 * ControlPanel Component
 * Main control buttons for the assistive vision app.
 * 
 * Updated for blocking live mode:
 * - Live mode shows speaking status
 * - Removed FPS slider (blocking mode is self-pacing)
 */

import React from 'react';
import './ControlPanel.css';

function ControlPanel({
  mode,
  setMode,
  isLiveRunning,
  isStreaming,
  onStartLive,
  onStopLive,
  onReadText,
  onDescribe,
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
      
      {/* Mode Selection */}
      <div className="control-group">
        <h3 className="control-group-title">Mode</h3>
        <div className="mode-buttons">
          <button
            className={`mode-button ${mode === 'live_assist' ? 'active' : ''}`}
            onClick={() => setMode('live_assist')}
            aria-pressed={mode === 'live_assist'}
            disabled={isLiveRunning}
          >
            🔴 Live Assist
          </button>
          <button
            className={`mode-button ${mode === 'read_text' ? 'active' : ''}`}
            onClick={() => setMode('read_text')}
            aria-pressed={mode === 'read_text'}
            disabled={isLiveRunning}
          >
            📖 Read Text
          </button>
          <button
            className={`mode-button ${mode === 'describe' ? 'active' : ''}`}
            onClick={() => setMode('describe')}
            aria-pressed={mode === 'describe'}
            disabled={isLiveRunning}
          >
            💬 Describe
          </button>
        </div>
      </div>
      
      {/* Primary Actions */}
      <div className="control-group">
        <h3 className="control-group-title">Actions</h3>
        
        {/* Live Assist Control */}
        {mode === 'live_assist' && (
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
        )}
        
        {/* Read Text */}
        {mode === 'read_text' && (
          <button
            className="btn btn-secondary btn-large"
            onClick={onReadText}
            disabled={!isStreaming || isProcessing || isSpeaking}
            aria-label="Read text from camera"
          >
            {isProcessing ? '⏳ Reading...' : isSpeaking ? '🔊 Speaking...' : '📖 Read Text'}
          </button>
        )}
        
        {/* Describe Scene */}
        {mode === 'describe' && (
          <button
            className="btn btn-secondary btn-large"
            onClick={onDescribe}
            disabled={!isStreaming || isProcessing || isSpeaking}
            aria-label="Describe current scene"
          >
            {isProcessing ? '⏳ Describing...' : isSpeaking ? '🔊 Speaking...' : '💬 Describe Scene'}
          </button>
        )}
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
