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
  const canvasRef = useRef(null);
  const ipImageRef = useRef(null);
  const ipIntervalRef = useRef(null);
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
        
        // For IP Webcam, we fetch individual frames using shot.jpg endpoint
        // This avoids CORS/MJPEG issues with the video element
        
        // Create a hidden canvas and image for frame capture
        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas');
        }
        if (!ipImageRef.current) {
          ipImageRef.current = new Image();
          ipImageRef.current.crossOrigin = 'anonymous';
        }
        
        // Test the connection first
        const testUrl = `${urls.shot_url}?t=${Date.now()}`;
        
        await new Promise((resolve, reject) => {
          const testImg = new Image();
          testImg.crossOrigin = 'anonymous';
          
          const timeoutId = setTimeout(() => {
            reject(new Error('IP Webcam connection timeout. Check IP address and ensure phone app is running.'));
          }, 10000);
          
          testImg.onload = () => {
            clearTimeout(timeoutId);
            resolve();
          };
          
          testImg.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error('Failed to connect to IP Webcam. Check IP address and network.'));
          };
          
          testImg.src = testUrl;
        });
        
        // Connection successful - start streaming frames to video element
        if (videoRef.current) {
          // Use the MJPEG video stream directly in an img tag drawn to canvas
          const startStreaming = () => {
            const img = ipImageRef.current;
            const canvas = canvasRef.current;
            const video = videoRef.current;
            
            // Fetch and display frames
            const fetchFrame = () => {
              if (!ipIntervalRef.current) return;
              
              const frameImg = new Image();
              frameImg.crossOrigin = 'anonymous';
              
              frameImg.onload = () => {
                // Set canvas size to match image
                canvas.width = frameImg.width;
                canvas.height = frameImg.height;
                
                // Draw to canvas
                const ctx = canvas.getContext('2d');
                ctx.drawImage(frameImg, 0, 0);
                
                // Create video-compatible stream from canvas
                if (!video.srcObject) {
                  const stream = canvas.captureStream(30);
                  video.srcObject = stream;
                  video.play().catch(console.error);
                }
              };
              
              frameImg.src = `${urls.shot_url}?t=${Date.now()}`;
            };
            
            // Fetch frames at ~15 FPS
            ipIntervalRef.current = setInterval(fetchFrame, 66);
            fetchFrame(); // Start immediately
          };
          
          startStreaming();
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
    // Clear IP webcam interval
    if (ipIntervalRef.current) {
      clearInterval(ipIntervalRef.current);
      ipIntervalRef.current = null;
    }
    
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
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
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ipIntervalRef.current) {
        clearInterval(ipIntervalRef.current);
      }
    };
  }, []);
  
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
