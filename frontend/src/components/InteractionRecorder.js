/**
 * InteractionRecorder Component
 * Controls for recording and processing interactions.
 */

import React, { useState } from 'react';
import { useInteraction } from '../hooks/useInteraction';
import './InteractionRecorder.css';

function InteractionRecorder({ 
  captureFrame,  // Function to capture current camera frame
  isStreaming,   // Whether camera is active
  onInteractionComplete  // Callback when interaction is processed
}) {
  const {
    isRecording,
    isProcessing,
    error,
    lastResult,
    liveTranscript,
    speechAvailable,
    startRecording,
    stopRecording,
    cancelRecording
  } = useInteraction();
  
  const [saveAudio, setSaveAudio] = useState(false);
  const [useFaceRecognition, setUseFaceRecognition] = useState(true);
  
  const handleStart = async () => {
    try {
      await startRecording();
    } catch (err) {
      console.error('Failed to start:', err);
    }
  };
  
  const handleStop = async () => {
    try {
      // Capture face image if camera is active and face recognition is enabled
      let faceImage = null;
      if (isStreaming && useFaceRecognition && captureFrame) {
        faceImage = captureFrame();
      }
      
      const result = await stopRecording(faceImage, saveAudio);
      
      if (result && onInteractionComplete) {
        onInteractionComplete(result);
      }
    } catch (err) {
      console.error('Failed to stop:', err);
    }
  };
  
  return (
    <div className="interaction-recorder">
      <h3 className="recorder-title">
        <span className="recorder-icon">🎤</span>
        Interaction Recording
      </h3>
      
      {/* Recording Status */}
      {isRecording && (
        <div className="recording-status">
          <span className="recording-dot"></span>
          Recording...
          {!speechAvailable && (
            <span className="speech-warning"> (Speech API unavailable)</span>
          )}
        </div>
      )}
      
      {/* Live Transcript Display */}
      {isRecording && liveTranscript && (
        <div className="live-transcript">
          <span className="transcript-icon">💬</span>
          <p className="transcript-text">{liveTranscript}</p>
        </div>
      )}
      
      {isProcessing && (
        <div className="processing-status">
          <span className="processing-spinner">⏳</span>
          Processing interaction...
        </div>
      )}
      
      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}
      
      {/* Main Controls */}
      <div className="recorder-controls">
        {!isRecording ? (
          <button
            className="btn btn-record"
            onClick={handleStart}
            disabled={isProcessing}
            aria-label="Start recording interaction"
          >
            🎙️ Start Interaction
          </button>
        ) : (
          <div className="recording-actions">
            <button
              className="btn btn-stop"
              onClick={handleStop}
              disabled={isProcessing}
              aria-label="Stop and process interaction"
            >
              ⏹️ Stop & Process
            </button>
            <button
              className="btn btn-cancel"
              onClick={cancelRecording}
              disabled={isProcessing}
              aria-label="Cancel recording"
            >
              ✕ Cancel
            </button>
          </div>
        )}
      </div>
      
      {/* Options */}
      <div className="recorder-options">
        <label className="option-checkbox">
          <input
            type="checkbox"
            checked={saveAudio}
            onChange={(e) => setSaveAudio(e.target.checked)}
            disabled={isRecording || isProcessing}
          />
          <span>Save audio recording</span>
        </label>
        
        <label className="option-checkbox">
          <input
            type="checkbox"
            checked={useFaceRecognition}
            onChange={(e) => setUseFaceRecognition(e.target.checked)}
            disabled={isRecording || isProcessing}
          />
          <span>Use face recognition</span>
        </label>
      </div>
      
      {/* Last Result Preview */}
      {lastResult && !isRecording && !isProcessing && (
        <div className="last-result">
          <div className="result-header">
            <span className="result-icon">✓</span>
            <span className="result-person">
              {lastResult.is_new_person ? 'New: ' : ''}
              {lastResult.person_name}
            </span>
          </div>
          {lastResult.summary && (
            <p className="result-summary">{lastResult.summary.summary}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default InteractionRecorder;
