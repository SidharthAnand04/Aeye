/**
 * useCamera Hook
 * Handles webcam access and frame capture.
 * Supports both local webcam and IP Webcam (phone camera over network)
 */

import { useRef, useState, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || '';

export function useCamera() {
  const videoRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [cameraSource, setCameraSource] = useState('local'); // 'local' or 'ip-webcam'
  const [ipWebcamConfig, setIpWebcamConfig] = useState(null);
  
  // Fetch IP Webcam config from backend
  const fetchIpWebcamConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/config/ip-webcam`);
      if (response.ok) {
        const config = await response.json();
        setIpWebcamConfig(config);
        return config;
      }
    } catch (err) {
      console.error('Failed to fetch IP Webcam config:', err);
    }
    return null;
  }, []);
  
  const startCamera = useCallback(async (source = 'local') => {
    try {
      setError(null);
      setCameraSource(source);
      
      if (source === 'ip-webcam') {
        // Use IP Webcam stream
        let config = ipWebcamConfig;
        if (!config) {
          config = await fetchIpWebcamConfig();
        }
        
        if (!config || !config.enabled) {
          throw new Error('IP Webcam not configured. Please set IP_WEBCAM_URL in backend .env file.');
        }
        
        if (videoRef.current) {
          // IP Webcam provides MJPEG stream at /video endpoint
          videoRef.current.src = config.video_url;
          videoRef.current.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current.play()
                .then(resolve)
                .catch(reject);
            };
            videoRef.current.onerror = () => reject(new Error('Failed to load IP Webcam stream'));
            // Timeout after 10 seconds
            setTimeout(() => reject(new Error('IP Webcam connection timeout')), 10000);
          });
          
          setIsStreaming(true);
        }
      } else {
        // Use local webcam
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment' // Prefer back camera on mobile
          },
          audio: false
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsStreaming(true);
        }
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError(err.message || 'Failed to access camera');
      setIsStreaming(false);
    }
  }, [ipWebcamConfig, fetchIpWebcamConfig]);
  
  const stopCamera = useCallback(() => {
    if (videoRef.current) {
      if (cameraSource === 'local' && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      } else {
        // IP Webcam - just clear the src
        videoRef.current.src = '';
      }
    }
    setIsStreaming(false);
  }, [cameraSource]);
  
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !isStreaming) {
      return null;
    }
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Return as base64 JPEG (smaller than PNG)
    return canvas.toDataURL('image/jpeg', 0.8);
  }, [isStreaming]);
  
  return {
    videoRef,
    isStreaming,
    error,
    cameraSource,
    ipWebcamConfig,
    startCamera,
    stopCamera,
    captureFrame,
    fetchIpWebcamConfig
  };
}
