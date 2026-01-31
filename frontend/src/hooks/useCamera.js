/**
 * useCamera Hook
 * Handles webcam access and frame capture.
 */

import { useRef, useState, useCallback } from 'react';

export function useCamera() {
  const videoRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
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
    } catch (err) {
      console.error('Camera error:', err);
      setError(err.message || 'Failed to access camera');
      setIsStreaming(false);
    }
  }, []);
  
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);
  
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
    startCamera,
    stopCamera,
    captureFrame
  };
}
