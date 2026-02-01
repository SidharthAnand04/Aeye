/**
 * useCamera Hook
 * Handles webcam access and frame capture.
 * Supports both local webcam and IP Webcam (phone camera over network)
 */

import { useRef, useState, useCallback, useEffect } from 'react';

// Local storage key for saving IP address
const IP_WEBCAM_STORAGE_KEY = 'aeye_ip_webcam_address';

export function useCamera() {
  const videoRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [cameraSource, setCameraSource] = useState('local'); // 'local' or 'ip-webcam'
  const [ipWebcamAddress, setIpWebcamAddress] = useState('');
  
  // Load saved IP address from localStorage on mount
  useEffect(() => {
    const savedAddress = localStorage.getItem(IP_WEBCAM_STORAGE_KEY);
    if (savedAddress) {
      setIpWebcamAddress(savedAddress);
    }
  }, []);
  
  // Save IP address to localStorage when it changes
  const updateIpWebcamAddress = useCallback((address) => {
    setIpWebcamAddress(address);
    if (address) {
      localStorage.setItem(IP_WEBCAM_STORAGE_KEY, address);
    } else {
      localStorage.removeItem(IP_WEBCAM_STORAGE_KEY);
    }
  }, []);
  
  // Build IP Webcam URLs from address
  const getIpWebcamUrls = useCallback((address) => {
    if (!address) return null;
    
    // Ensure address has http:// prefix
    let baseUrl = address.trim();
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `http://${baseUrl}`;
    }
    
    // Remove trailing slash if present
    baseUrl = baseUrl.replace(/\/$/, '');
    
    return {
      video_url: `${baseUrl}/video`,
      shot_url: `${baseUrl}/shot.jpg`,
    };
  }, []);
  
  const startCamera = useCallback(async (source = 'local', customIpAddress = null) => {
    try {
      setError(null);
      setCameraSource(source);
      
      if (source === 'ip-webcam') {
        // Use provided address or saved address
        const address = customIpAddress || ipWebcamAddress;
        
        if (!address) {
          throw new Error('Please enter IP Webcam address (e.g., 192.168.1.100:8080)');
        }
        
        const urls = getIpWebcamUrls(address);
        
        if (videoRef.current) {
          // IP Webcam provides MJPEG stream at /video endpoint
          videoRef.current.src = urls.video_url;
          videoRef.current.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('IP Webcam connection timeout. Check IP address and ensure phone app is running.'));
            }, 10000);
            
            videoRef.current.onloadedmetadata = () => {
              clearTimeout(timeoutId);
              videoRef.current.play()
                .then(resolve)
                .catch(reject);
            };
            videoRef.current.onerror = () => {
              clearTimeout(timeoutId);
              reject(new Error('Failed to connect to IP Webcam. Check IP address and network.'));
            };
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
  }, [ipWebcamAddress, getIpWebcamUrls]);
  
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
    ipWebcamAddress,
    setIpWebcamAddress: updateIpWebcamAddress,
    startCamera,
    stopCamera,
    captureFrame
  };
}
