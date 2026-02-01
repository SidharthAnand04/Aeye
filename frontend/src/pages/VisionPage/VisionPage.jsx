/**
 * Vision Assistance Page
 * Live camera view with AI-powered scene understanding
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Square, 
  Camera,
  Volume2,
  VolumeX,
  Eye,
  Type,
  Mic,
  ChevronRight,
  ChevronLeft,
  Info,
  Loader2,
  Sparkles
} from 'lucide-react';
import PageTransition from '../../components/layout/PageTransition';
import { 
  Button, 
  IconButton,
  SegmentedControl, 
  Toggle,
  Drawer,
  Card,
  Badge,
  ProcessingIndicator,
  SpeakingIndicator
} from '../../components/ui';
import { useCamera } from '../../hooks/useCamera';
import { useDetection } from '../../hooks/useDetection';
import { useSpeech } from '../../hooks/useSpeech';
import './VisionPage.css';

// Detection label colors
const LABEL_COLORS = {
  person: '#2563EB',
  car: '#EF4444',
  bike: '#F59E0B',
  dog: '#8B5CF6',
  chair: '#10B981',
  door: '#06B6D4',
  stairs: '#EC4899',
};

const VisionPage = () => {
  // State
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [lastTrace, setLastTrace] = useState(null);
  const [currentState, setCurrentState] = useState('idle'); // idle, capturing, thinking, speaking, done
  
  // Refs
  const overlayRef = useRef(null);
  const liveLoopRef = useRef(false);
  
  // Hooks
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

  // Draw bounding boxes
  useEffect(() => {
    if (!overlayRef.current || !videoRef.current) return;
    
    const canvas = overlayRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!detections || detections.length === 0) return;
    
    detections.forEach((det) => {
      const color = LABEL_COLORS[det.label] || '#ffffff';
      const bbox = det.bbox;
      
      const x = bbox.x1 * canvas.width;
      const y = bbox.y1 * canvas.height;
      const width = (bbox.x2 - bbox.x1) * canvas.width;
      const height = (bbox.y2 - bbox.y1) * canvas.height;
      
      // Bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
      
      // Label background
      const label = `${det.label} ${Math.round(det.confidence * 100)}%`;
      ctx.font = 'bold 14px Inter, sans-serif';
      const textWidth = ctx.measureText(label).width;
      const textHeight = 18;
      const padding = 4;
      
      ctx.fillStyle = color;
      ctx.fillRect(x - 1, y - textHeight - padding * 2, textWidth + padding * 2, textHeight + padding * 2);
      
      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + padding, y - padding - 4);
    });
  }, [detections, videoRef]);

  // Live loop - only handles narration, not detection
  const runLiveLoop = useCallback(async () => {
    if (!liveLoopRef.current || !isStreaming) return;
    
    setCurrentState('capturing');
    const frame = captureFrame();
    
    if (!frame) {
      setTimeout(() => runLiveLoop(), 500);
      return;
    }
    
    setCurrentState('thinking');
    const result = await getLiveNarrative(frame);
    
    if (!liveLoopRef.current) return;
    
    if (result.timing) {
      setLastTrace({
        narrative: result.narrative,
        timing: result.timing,
        detectionCount: result.detections?.length || 0
      });
    }
    
    if (result.narrative && !muted) {
      setCurrentState('speaking');
      await speakAndWait(result.narrative, { rate: 1.3 });
    }
    
    setCurrentState('done');
    
    // Continue the narration loop after speech completes
    if (liveLoopRef.current) {
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
    runLiveLoop();
  }, [isStreaming, startCamera, runLiveLoop]);

  // Stop live mode
  const handleStopLive = useCallback(() => {
    liveLoopRef.current = false;
    setIsLiveRunning(false);
    setCurrentState('idle');
    stopSpeech();
  }, [stopSpeech]);

  // Describe scene
  const handleDescribeScene = useCallback(async () => {
    if (!isStreaming || isProcessing || isSpeaking) return;
    
    const frame = captureFrame();
    if (!frame) return;
    
    setCurrentState('thinking');
    const result = await describeSceneDetailed(frame);
    
    if (result.description && !muted) {
      setCurrentState('speaking');
      await speakAndWait(result.description, { rate: 1.3 });
    }
    
    setCurrentState('idle');
  }, [isStreaming, isProcessing, isSpeaking, captureFrame, describeSceneDetailed, speakAndWait, muted]);

  // Detection loop for overlays - runs continuously regardless of live mode
  const detectionIntervalRef = useRef(null);
  
  useEffect(() => {
    if (isStreaming) {
      // Run detection continuously for bounding box updates
      detectionIntervalRef.current = setInterval(async () => {
        const frame = captureFrame();
        if (frame) {
          await processFrame(frame);
        }
      }, 200); // Faster detection rate (200ms = 5 FPS)
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
  }, [isStreaming, captureFrame, processFrame]);

  // Get status indicator
  const getStatusContent = () => {
    if (isLiveRunning) {
      switch (currentState) {
        case 'capturing':
          return <Badge variant="primary" dot pulse>Capturing</Badge>;
        case 'thinking':
          return <ProcessingIndicator label="Analyzing..." />;
        case 'speaking':
          return <SpeakingIndicator label="Now Speaking" />;
        default:
          return <Badge variant="success" dot pulse>Live Active</Badge>;
      }
    }
    if (isProcessing) {
      return <ProcessingIndicator label="Processing..." />;
    }
    if (isSpeaking) {
      return <SpeakingIndicator />;
    }
    if (isStreaming) {
      return <Badge variant="success" dot>Camera Ready</Badge>;
    }
    return <Badge variant="default">Idle</Badge>;
  };

  return (
    <PageTransition className="vision-page">
      <div className="vision-container">
        {/* Main Content */}
        <div className="vision-main">
          {/* Camera Panel */}
          <div className="camera-panel">
            <div className="camera-frame">
              {/* Error State */}
              {cameraError && (
                <div className="camera-error">
                  <Info size={24} />
                  <p>{cameraError}</p>
                </div>
              )}
              
              {/* Video */}
              <video
                ref={videoRef}
                className="camera-video"
                playsInline
                muted
                aria-label="Camera feed"
              />
              
              {/* Overlay Canvas */}
              <canvas
                ref={overlayRef}
                className="camera-overlay"
                aria-hidden="true"
              />
              
              {/* Placeholder */}
              {!isStreaming && !cameraError && (
                <div className="camera-placeholder">
                  <div className="placeholder-icon">
                    <Camera size={48} />
                  </div>
                  <p>Click "Start Camera" to begin</p>
                  <Button onClick={startCamera} icon={<Camera />}>
                    Start Camera
                  </Button>
                </div>
              )}

              {/* Status Bar */}
              <div className="camera-status-bar">
                <div className="status-left">
                  {getStatusContent()}
                </div>
                <div className="status-right">
                  {isStreaming && detections?.length > 0 && (
                    <Badge variant="default">
                      {detections.length} detected
                    </Badge>
                  )}
                  {latency > 0 && (
                    <span className="latency-text">{Math.round(latency)}ms</span>
                  )}
                </div>
              </div>

              {/* Live Indicator */}
              <AnimatePresence>
                {isLiveRunning && (
                  <motion.div
                    className="live-indicator"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <span className="live-dot" />
                    LIVE
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Controls */}
          <div className="controls-panel">
            <Card padding="md" variant="bordered">
              <div className="controls-grid">
                {/* Primary Actions */}
                <div className="control-group">
                  <h3 className="control-label">Vision Mode</h3>
                  <div className="control-actions">
                    {!isLiveRunning ? (
                      <Button 
                        onClick={handleStartLive}
                        icon={<Play />}
                        disabled={!isStreaming}
                        fullWidth
                      >
                        Start Live Assist
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleStopLive}
                        variant="danger"
                        icon={<Square />}
                        fullWidth
                      >
                        Stop Live Assist
                      </Button>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="control-group">
                  <h3 className="control-label">Quick Actions</h3>
                  <div className="control-actions">
                    <Button
                      variant="secondary"
                      onClick={handleDescribeScene}
                      disabled={!isStreaming || isProcessing || isSpeaking || isLiveRunning}
                      icon={<Sparkles />}
                      fullWidth
                    >
                      Describe Scene
                    </Button>
                  </div>
                </div>

                {/* Settings */}
                <div className="control-group">
                  <h3 className="control-label">Settings</h3>
                  <div className="control-settings">
                    <Toggle
                      checked={!muted}
                      onChange={() => setMuted(!muted)}
                      label="Voice Output"
                    />
                    <Toggle
                      checked={showTrace}
                      onChange={() => setShowTrace(!showTrace)}
                      label="Show Trace Panel"
                    />
                  </div>
                </div>

                {/* Camera Controls */}
                <div className="control-group">
                  <h3 className="control-label">Camera</h3>
                  <div className="control-actions">
                    {!isStreaming ? (
                      <Button
                        variant="secondary"
                        onClick={startCamera}
                        icon={<Camera />}
                        fullWidth
                      >
                        Start Camera
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={stopCamera}
                        disabled={isLiveRunning}
                        fullWidth
                      >
                        Stop Camera
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Trace Panel Toggle */}
        <button
          className="trace-toggle"
          onClick={() => setShowTrace(!showTrace)}
          aria-label={showTrace ? 'Hide trace panel' : 'Show trace panel'}
        >
          {showTrace ? <ChevronRight /> : <ChevronLeft />}
        </button>

        {/* Trace Drawer */}
        <Drawer
          isOpen={showTrace}
          onClose={() => setShowTrace(false)}
          title="Trace Panel"
          size="md"
          overlay={false}
        >
          <div className="trace-content">
            {/* Last Trace */}
            {lastTrace && (
              <div className="trace-section">
                <h4 className="trace-section-title">Latest Analysis</h4>
                <div className="trace-stats">
                  <div className="trace-stat">
                    <span className="trace-stat-label">Objects</span>
                    <span className="trace-stat-value">{lastTrace.detectionCount}</span>
                  </div>
                  <div className="trace-stat">
                    <span className="trace-stat-label">Latency</span>
                    <span className="trace-stat-value">{Math.round(lastTrace.timing?.total_ms || 0)}ms</span>
                  </div>
                </div>
                {lastTrace.narrative && (
                  <div className="trace-narrative">
                    <p>{lastTrace.narrative}</p>
                  </div>
                )}
              </div>
            )}

            {/* Speech Log */}
            <div className="trace-section">
              <div className="trace-section-header">
                <h4 className="trace-section-title">Speech Log</h4>
                {speechLog.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearLog}>
                    Clear
                  </Button>
                )}
              </div>
              {speechLog.length === 0 ? (
                <p className="trace-empty">No speech history yet.</p>
              ) : (
                <div className="speech-log-list">
                  {speechLog.slice(-10).reverse().map((entry, i) => (
                    <div key={i} className="speech-log-item">
                      <span className="speech-log-time">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <p className="speech-log-text">{entry.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detections */}
            <div className="trace-section">
              <h4 className="trace-section-title">Current Detections</h4>
              {detections.length === 0 ? (
                <p className="trace-empty">No objects detected.</p>
              ) : (
                <div className="detection-list">
                  {detections.map((det, i) => (
                    <div key={i} className="detection-item">
                      <span 
                        className="detection-dot" 
                        style={{ backgroundColor: LABEL_COLORS[det.label] || '#6B7280' }}
                      />
                      <span className="detection-label">{det.label}</span>
                      <span className="detection-confidence">
                        {Math.round(det.confidence * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Drawer>
      </div>

      {/* Accessibility announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
        className="sr-only"
      >
        {lastNarrative}
      </div>
    </PageTransition>
  );
};

export default VisionPage;
