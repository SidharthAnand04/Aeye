/**
 * Aeye - Real-time Assistive Vision Application
 * Main App component with camera streaming, detection overlay, and accessible controls.
 * 
 * Key design changes:
 * - Live mode is BLOCKING: capture → describe → speak to completion → repeat
 * - No alert-based speech, only rich narrative descriptions
 * - Detection runs separately for visual overlays only
 * - Speech never interrupted mid-sentence
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

// Components
import CameraView from './components/CameraView';
import ControlPanel from './components/ControlPanel';
import TracePanel from './components/TracePanel';
import SpeechLog from './components/SpeechLog';
import StatusBar from './components/StatusBar';

// Hooks
import { useCamera } from './hooks/useCamera';
import { useDetection } from './hooks/useDetection';
import { useSpeech } from './hooks/useSpeech';

// Constants
const MODES = {
  LIVE_ASSIST: 'live_assist',
  READ_TEXT: 'read_text',
  DESCRIBE: 'describe',
};

function App() {
  // State
  const [mode, setMode] = useState(MODES.LIVE_ASSIST);
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [showTrace, setShowTrace] = useState(true);
  const [muted, setMuted] = useState(false);
  const [lastTrace, setLastTrace] = useState(null);
  
  // Refs
  const canvasRef = useRef(null);
  const liveLoopRef = useRef(false);  // Control flag for live loop
  
  // Custom hooks
  const { 
    videoRef, 
    isStreaming, 
    error: cameraError, 
    startCamera, 
    stopCamera,
    captureFrame 
  } = useCamera();
  
  const {
    detections,
    latency,
    lastNarrative,
    processFrame,
    getLiveNarrative,
    readText,
    describeScene,
    isProcessing
  } = useDetection();
  
  const {
    speak,
    speakAndWait,
    stop: stopSpeech,
    speechLog,
    clearLog,
    isSpeaking
  } = useSpeech();
  
  /**
   * BLOCKING Live Assist Loop
   * 1. Capture frame
   * 2. Get scene narrative from vision model
   * 3. Speak narrative to COMPLETION
   * 4. Only then capture next frame
   */
  const runLiveLoop = useCallback(async () => {
    if (!liveLoopRef.current || !isStreaming) {
      return;
    }
    
    // 1. Capture frame
    const frame = captureFrame();
    if (!frame) {
      // Retry after short delay
      setTimeout(() => runLiveLoop(), 500);
      return;
    }
    
    // 2. Get narrative from vision model
    const result = await getLiveNarrative(frame);
    
    // Check if we should still be running
    if (!liveLoopRef.current) return;
    
    // 3. Update trace for judges panel
    if (result.timing) {
      setLastTrace({
        narrative: result.narrative,
        timing: result.timing,
        detectionCount: result.detections?.length || 0
      });
    }
    
    // 4. Speak narrative to completion (BLOCKING)
    if (result.narrative && !muted) {
      await speakAndWait(result.narrative, { rate: 0.95 });
    }
    
    // 5. Check if still running, then loop
    if (liveLoopRef.current) {
      // Small delay before next cycle (prevents hammering)
      setTimeout(() => runLiveLoop(), 100);
    }
  }, [isStreaming, captureFrame, getLiveNarrative, speakAndWait, muted]);
  
  // Start live mode
  const handleStartLive = useCallback(async () => {
    if (!isStreaming) {
      await startCamera();
    }
    liveLoopRef.current = true;
    setIsLiveRunning(true);
    // Start the blocking loop
    runLiveLoop();
  }, [isStreaming, startCamera, runLiveLoop]);
  
  // Stop live mode
  const handleStopLive = useCallback(() => {
    liveLoopRef.current = false;
    setIsLiveRunning(false);
    stopSpeech();  // Stop any ongoing speech
  }, [stopSpeech]);
  
  // Handle mode-specific actions (on-demand, not live)
  const handleReadText = useCallback(async () => {
    const frame = captureFrame();
    if (frame) {
      const text = await readText(frame);
      if (text && !muted) {
        speak(text);
      }
    }
  }, [captureFrame, readText, speak, muted]);
  
  const handleDescribe = useCallback(async () => {
    const frame = captureFrame();
    if (frame) {
      const description = await describeScene(frame);
      if (description && !muted) {
        speak(description);
      }
    }
  }, [captureFrame, describeScene, speak, muted]);
  
  // Quick phrases for voice booster
  const quickPhrases = [
    "Excuse me",
    "Can you help me?",
    "I can't see well",
    "Where is the exit?",
    "Thank you"
  ];
  
  const handleQuickPhrase = useCallback((phrase) => {
    speak(phrase, { rate: 1.0, volume: 1.0 });
  }, [speak]);
  
  // Separate detection loop for visual overlays (runs independently)
  const detectionIntervalRef = useRef(null);
  
  useEffect(() => {
    if (isStreaming && !isLiveRunning) {
      // When not in live mode, run detection for overlays at ~2 FPS
      detectionIntervalRef.current = setInterval(async () => {
        const frame = captureFrame();
        if (frame) {
          await processFrame(frame);
        }
      }, 500);
    } else {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    }
    
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [isStreaming, isLiveRunning, captureFrame, processFrame]);
  
  return (
    <div className="app" role="application" aria-label="Aeye Assistive Vision">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">
          <span className="app-icon" aria-hidden="true">👁️</span>
          Aeye
        </h1>
        <StatusBar 
          isStreaming={isStreaming}
          isRunning={isLiveRunning}
          isProcessing={isProcessing}
          latency={latency}
          isSpeaking={isSpeaking}
        />
      </header>
      
      {/* Main content */}
      <main className="app-main">
        {/* Camera view with overlay */}
        <div className="camera-section">
          <CameraView 
            videoRef={videoRef}
            canvasRef={canvasRef}
            detections={detections}
            isStreaming={isStreaming}
            error={cameraError}
          />
          
          {/* Camera indicator */}
          {isStreaming && (
            <div className="camera-indicator" aria-live="polite">
              <span className={`indicator-dot ${isLiveRunning ? 'live' : ''}`}></span>
              {isLiveRunning ? 'Live Mode Active' : 'Camera Active'}
            </div>
          )}
          
          {/* Speaking indicator */}
          {isSpeaking && (
            <div className="speaking-indicator">
              <span className="speaking-icon">🔊</span>
              Speaking...
            </div>
          )}
        </div>
        
        {/* Control panel */}
        <div className="controls-section">
          <ControlPanel
            mode={mode}
            setMode={setMode}
            isLiveRunning={isLiveRunning}
            isStreaming={isStreaming}
            onStartLive={handleStartLive}
            onStopLive={handleStopLive}
            onReadText={handleReadText}
            onDescribe={handleDescribe}
            onStartCamera={startCamera}
            onStopCamera={stopCamera}
            muted={muted}
            setMuted={setMuted}
            isProcessing={isProcessing}
            isSpeaking={isSpeaking}
          />
          
          {/* Quick phrases */}
          <div className="quick-phrases">
            <h3>Quick Phrases</h3>
            <div className="phrase-buttons">
              {quickPhrases.map((phrase, index) => (
                <button
                  key={index}
                  className="phrase-button"
                  onClick={() => handleQuickPhrase(phrase)}
                  aria-label={`Speak: ${phrase}`}
                >
                  {phrase}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Side panel for judges */}
        <aside className="side-panel">
          {/* Trace panel toggle */}
          <button 
            className="trace-toggle"
            onClick={() => setShowTrace(!showTrace)}
            aria-expanded={showTrace}
          >
            {showTrace ? 'Hide' : 'Show'} Trace Panel
          </button>
          
          {showTrace && (
            <TracePanel 
              trace={lastTrace}
              lastNarrative={lastNarrative}
              detections={detections}
              isLiveRunning={isLiveRunning}
            />
          )}
          
          {/* Speech log */}
          <SpeechLog 
            log={speechLog}
            onClear={clearLog}
            isSpeaking={isSpeaking}
          />
        </aside>
      </main>
      
      {/* Accessibility announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
        className="sr-only"
      >
        {lastNarrative}
      </div>
    </div>
  );
}

export default App;
