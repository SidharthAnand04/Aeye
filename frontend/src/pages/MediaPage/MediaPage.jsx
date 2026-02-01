/**
 * Media Upload Page
 * Upload video or photo for AI-powered scene understanding
 * Visually identical to VisionPage when media is streaming
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Square, 
  Camera,
  Upload,
  Image,
  Video,
  FileVideo,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronRight,
  ChevronLeft,
  Info,
  Sparkles,
  X
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
  SpeakingIndicator,
  Slider
} from '../../components/ui';
import { useDetection } from '../../hooks/useDetection';
import { useSpeech } from '../../hooks/useSpeech';
import './MediaPage.css';

// Detection label colors (same as VisionPage)
const LABEL_COLORS = {
  person: '#2563EB',
  car: '#EF4444',
  bike: '#F59E0B',
  dog: '#8B5CF6',
  chair: '#10B981',
  door: '#06B6D4',
  stairs: '#EC4899',
};

const MediaPage = () => {
  // State
  const [mediaType, setMediaType] = useState(null); // 'video' | 'image' | null
  const [mediaUrl, setMediaUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [lastTrace, setLastTrace] = useState(null);
  const [currentState, setCurrentState] = useState('idle');
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  // Refs
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const liveLoopRef = useRef(false);
  const animationFrameRef = useRef(null);
  
  // Hooks
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [mediaUrl]);

  // Handle file selection
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }, []);

  // Process file (used by both input and drag-drop)
  const processFile = useCallback((file) => {
    // Clean up previous URL
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }
    
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    
    if (!isVideo && !isImage) {
      alert('Please select a video or image file');
      return;
    }
    
    setMediaType(isVideo ? 'video' : 'image');
    setMediaUrl(url);
    setFileName(file.name);
    setIsPlaying(false);
    setIsLiveRunning(false);
    liveLoopRef.current = false;
    setCurrentTime(0);
    setIsDragging(false);
  }, [mediaUrl]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  // Capture frame from video or image
  const captureFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    
    if (mediaType === 'video' && videoRef.current) {
      const video = videoRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return null;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
    } else if (mediaType === 'image' && imageRef.current) {
      const img = imageRef.current;
      if (!img.complete || img.naturalWidth === 0) return null;
      
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    } else {
      return null;
    }
    
    return canvas.toDataURL('image/jpeg', 0.8);
  }, [mediaType]);

  // Draw bounding boxes
  useEffect(() => {
    if (!overlayRef.current) return;
    
    const canvas = overlayRef.current;
    const ctx = canvas.getContext('2d');
    
    let width, height;
    
    if (mediaType === 'video' && videoRef.current) {
      width = videoRef.current.videoWidth;
      height = videoRef.current.videoHeight;
    } else if (mediaType === 'image' && imageRef.current) {
      width = imageRef.current.naturalWidth;
      height = imageRef.current.naturalHeight;
    }
    
    if (width && height) {
      canvas.width = width;
      canvas.height = height;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!detections || detections.length === 0) return;
    
    detections.forEach((det) => {
      const color = LABEL_COLORS[det.label] || '#ffffff';
      const bbox = det.bbox;
      
      const x = bbox.x1 * canvas.width;
      const y = bbox.y1 * canvas.height;
      const bWidth = (bbox.x2 - bbox.x1) * canvas.width;
      const bHeight = (bbox.y2 - bbox.y1) * canvas.height;
      
      // Bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, bWidth, bHeight);
      
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
  }, [detections, mediaType]);

  // Live loop for video
  const runLiveLoop = useCallback(async () => {
    if (!liveLoopRef.current) return;
    
    // Check if video is still playing
    if (mediaType === 'video' && videoRef.current) {
      if (videoRef.current.paused || videoRef.current.ended) {
        liveLoopRef.current = false;
        setIsLiveRunning(false);
        setCurrentState('idle');
        return;
      }
    }
    
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
      await speakAndWait(result.narrative, { rate: 0.95 });
    }
    
    setCurrentState('done');
    
    if (liveLoopRef.current) {
      setTimeout(() => runLiveLoop(), 100);
    }
  }, [mediaType, captureFrame, getLiveNarrative, speakAndWait, muted]);

  // Start live mode
  const handleStartLive = useCallback(async () => {
    if (mediaType === 'video' && videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
    liveLoopRef.current = true;
    setIsLiveRunning(true);
    runLiveLoop();
  }, [mediaType, runLiveLoop]);

  // Stop live mode
  const handleStopLive = useCallback(() => {
    liveLoopRef.current = false;
    setIsLiveRunning(false);
    setCurrentState('idle');
    stopSpeech();
    if (mediaType === 'video' && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [mediaType, stopSpeech]);

  // Play/Pause video
  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Restart video
  const handleRestart = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    setCurrentTime(0);
  }, []);

  // Describe scene (single frame)
  const handleDescribeScene = useCallback(async () => {
    if (!mediaUrl || isProcessing || isSpeaking) return;
    
    const frame = captureFrame();
    if (!frame) return;
    
    setCurrentState('thinking');
    const result = await describeSceneDetailed(frame);
    
    if (result.description && !muted) {
      setCurrentState('speaking');
      await speakAndWait(result.description, { rate: 0.95 });
    }
    
    setCurrentState('idle');
  }, [mediaUrl, isProcessing, isSpeaking, captureFrame, describeSceneDetailed, speakAndWait, muted]);

  // Process single frame for detections
  const handleProcessFrame = useCallback(async () => {
    if (!mediaUrl || isProcessing) return;
    
    const frame = captureFrame();
    if (frame) {
      await processFrame(frame);
    }
  }, [mediaUrl, isProcessing, captureFrame, processFrame]);

  // Clear media
  const handleClearMedia = useCallback(() => {
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }
    setMediaUrl(null);
    setMediaType(null);
    setFileName('');
    setIsPlaying(false);
    setIsLiveRunning(false);
    liveLoopRef.current = false;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [mediaUrl]);

  // Video event handlers
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  // Handle seeking via progress bar click
  const handleSeek = useCallback((e) => {
    if (!videoRef.current || !videoDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = percent * videoDuration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [videoDuration]);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    if (isLiveRunning) {
      handleStopLive();
    }
  }, [isLiveRunning, handleStopLive]);

  // Update video playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Detection loop for video playback (without live narration)
  useEffect(() => {
    if (mediaType === 'video' && isPlaying && !isLiveRunning) {
      const interval = setInterval(async () => {
        const frame = captureFrame();
        if (frame) {
          await processFrame(frame);
        }
      }, 500);
      
      return () => clearInterval(interval);
    }
  }, [mediaType, isPlaying, isLiveRunning, captureFrame, processFrame]);

  // Process image on load
  const handleImageLoad = useCallback(async () => {
    const frame = captureFrame();
    if (frame) {
      await processFrame(frame);
    }
  }, [captureFrame, processFrame]);

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
    if (mediaUrl) {
      if (mediaType === 'video' && isPlaying) {
        return <Badge variant="success" dot pulse>Playing</Badge>;
      }
      return <Badge variant="success" dot>Ready</Badge>;
    }
    return <Badge variant="default">No Media</Badge>;
  };

  return (
    <PageTransition className="media-page">
      <div className="media-container">
        {/* Main Content */}
        <div className="media-main">
          {/* Media Panel */}
          <div 
            className={`media-panel ${isDragging ? 'media-panel-dragging' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className={`media-frame ${isDragging ? 'media-frame-dragging' : ''}`}>
              {/* Hidden canvas for frame capture */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              
              {/* Drag overlay */}
              <AnimatePresence>
                {isDragging && (
                  <motion.div 
                    className="drag-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Upload size={64} />
                    <p>Drop your video or image here</p>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Video Element */}
              {mediaType === 'video' && (
                <video
                  ref={videoRef}
                  src={mediaUrl}
                  className="media-video"
                  playsInline
                  muted
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleVideoEnded}
                  aria-label="Uploaded video"
                />
              )}
              
              {/* Image Element */}
              {mediaType === 'image' && (
                <img
                  ref={imageRef}
                  src={mediaUrl}
                  className="media-image"
                  alt="Uploaded image"
                  onLoad={handleImageLoad}
                />
              )}
              
              {/* Overlay Canvas */}
              <canvas
                ref={overlayRef}
                className="media-overlay"
                aria-hidden="true"
              />
              
              {/* Upload Placeholder */}
              {!mediaUrl && !isDragging && (
                <div className="media-placeholder">
                  <div className="placeholder-icon">
                    <Upload size={48} />
                  </div>
                  <p>Drag & drop a video or photo, or click to browse</p>
                  <div className="upload-options">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*,image/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      id="media-upload"
                    />
                    <Button 
                      onClick={() => fileInputRef.current?.click()}
                      icon={<Upload />}
                    >
                      Choose File
                    </Button>
                  </div>
                  <p className="upload-hint">Supports MP4, WebM, MOV, JPG, PNG</p>
                </div>
              )}

              {/* Video Controls Bar */}
              {mediaType === 'video' && mediaUrl && (
                <div className="video-controls-bar">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={handlePlayPause}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </IconButton>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={handleRestart}
                    aria-label="Restart"
                  >
                    <RotateCcw size={18} />
                  </IconButton>
                  <div className="video-progress" onClick={handleSeek}>
                    <div 
                      className="video-progress-bar"
                      style={{ width: `${(currentTime / videoDuration) * 100}%` }}
                    />
                  </div>
                  <span className="video-time">
                    {formatTime(currentTime)} / {formatTime(videoDuration)}
                  </span>
                </div>
              )}

              {/* Status Bar */}
              <div className="media-status-bar">
                <div className="status-left">
                  {getStatusContent()}
                </div>
                <div className="status-right">
                  {mediaUrl && detections?.length > 0 && (
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

              {/* File Badge */}
              {fileName && (
                <div className="file-badge">
                  {mediaType === 'video' ? <FileVideo size={14} /> : <Image size={14} />}
                  <span className="file-name">{fileName}</span>
                  <button className="file-clear" onClick={handleClearMedia}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="controls-panel">
            <Card padding="md" variant="bordered">
              <div className="controls-grid">
                {/* Upload */}
                <div className="control-group">
                  <h3 className="control-label">Media</h3>
                  <div className="control-actions">
                    <input
                      type="file"
                      accept="video/*,image/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      id="media-upload-ctrl"
                    />
                    <Button 
                      variant="secondary"
                      onClick={() => document.getElementById('media-upload-ctrl')?.click()}
                      icon={<Upload />}
                      fullWidth
                    >
                      {mediaUrl ? 'Change File' : 'Upload'}
                    </Button>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="control-group">
                  <h3 className="control-label">Analysis Mode</h3>
                  <div className="control-actions">
                    {mediaType === 'video' ? (
                      !isLiveRunning ? (
                        <Button 
                          onClick={handleStartLive}
                          icon={<Play />}
                          disabled={!mediaUrl}
                          fullWidth
                        >
                          Play & Analyze
                        </Button>
                      ) : (
                        <Button 
                          onClick={handleStopLive}
                          variant="danger"
                          icon={<Square />}
                          fullWidth
                        >
                          Stop
                        </Button>
                      )
                    ) : (
                      <Button
                        variant="primary"
                        onClick={handleDescribeScene}
                        disabled={!mediaUrl || isProcessing || isSpeaking}
                        icon={<Sparkles />}
                        fullWidth
                      >
                        Analyze Image
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
                      disabled={!mediaUrl || isProcessing || isSpeaking || isLiveRunning}
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

                {/* Playback Speed (video only) */}
                {mediaType === 'video' && (
                  <div className="control-group">
                    <h3 className="control-label">Playback Speed</h3>
                    <div className="control-settings">
                      <Slider
                        min={0.5}
                        max={2}
                        step={0.25}
                        value={playbackSpeed}
                        onChange={(value) => setPlaybackSpeed(value)}
                        label={`${playbackSpeed}x`}
                      />
                    </div>
                  </div>
                )}
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

export default MediaPage;
