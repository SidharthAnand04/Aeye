/**
 * Aeye - Real-time Assistive Vision Application
 * Autonomous assistive vision with automatic context-aware decision making.
 * 
 * Design principles:
 * - One continuous assistant (never pauses for mode selection)
 * - All modes inferred automatically from context (internal only)
 * - Spoken output is generated dynamically from real-time analysis
 * - No manual buttons, quick phrases, or mode selection exposed to user
 * - Focus: blind user safety and daily autonomy
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

// Components
import CameraView from './components/CameraView';
import ControlPanel from './components/ControlPanel';
import TracePanel from './components/TracePanel';
import SpeechLog from './components/SpeechLog';
import StatusBar from './components/StatusBar';
import PeopleTab from './components/PeopleTab';
import InteractionRecorder from './components/InteractionRecorder';

// Hooks
import { useCamera } from './hooks/useCamera';
import { useDetection } from './hooks/useDetection';
import { useSpeech } from './hooks/useSpeech';

function App() {
  // State
  // Note: mode is managed internally by backend, never exposed to user
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [showTrace, setShowTrace] = useState(true);
  const [muted, setMuted] = useState(false);
  const [lastTrace, setLastTrace] = useState(null);
  const [activeTab, setActiveTab] = useState('assist');  // 'assist' or 'people'
  const [peopleRefreshTrigger, setPeopleRefreshTrigger] = useState(0);
  
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
    describeSceneDetailed,
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
  
  // Handle describe scene button
  const handleDescribeScene = useCallback(async () => {
    if (!isStreaming || isProcessing || isSpeaking) {
      return;
    }
    
    // Capture current frame
    const frame = captureFrame();
    if (!frame) {
      console.error('Failed to capture frame');
      return;
    }
    
    // Get detailed scene description
    const result = await describeSceneDetailed(frame);
    
    // Speak the detailed description (blocking)
    if (result.description && !muted) {
      await speakAndWait(result.description, { rate: 0.95 });
    }
  }, [isStreaming, isProcessing, isSpeaking, captureFrame, describeSceneDetailed, speakAndWait, muted]);
  
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
        
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === 'assist' ? 'active' : ''}`}
            onClick={() => setActiveTab('assist')}
          >
            🎯 Assist
          </button>
          <button
            className={`tab-btn ${activeTab === 'people' ? 'active' : ''}`}
            onClick={() => setActiveTab('people')}
          >
            👥 People
          </button>
        </div>
        
        {/* Tab Content */}
        {activeTab === 'assist' ? (
          <>
            {/* Control panel */}
            <div className="controls-section">
              <ControlPanel
                isLiveRunning={isLiveRunning}
                isStreaming={isStreaming}
                onStartLive={handleStartLive}
                onStopLive={handleStopLive}
                onStartCamera={startCamera}
                onStopCamera={stopCamera}
                muted={muted}
                setMuted={setMuted}
                isProcessing={isProcessing}
                isSpeaking={isSpeaking}
                onDescribeScene={handleDescribeScene}
              />
              
              {/* Interaction Recorder */}
              <InteractionRecorder
                captureFrame={captureFrame}
                isStreaming={isStreaming}
                onInteractionComplete={(result) => {
                  setPeopleRefreshTrigger(prev => prev + 1);
                  // Optionally speak the summary
                  if (result.summary?.summary && !muted) {
                    speak(`Recorded conversation with ${result.person_name}. ${result.summary.summary}`);
                  }
                }}
              />
            </div>
          </>
        ) : (
          <div className="controls-section">
            <PeopleTab refreshTrigger={peopleRefreshTrigger} />
          </div>
        )}
        
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
