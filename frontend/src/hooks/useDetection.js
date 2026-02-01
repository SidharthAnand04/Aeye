/**
 * useDetection Hook
 * Handles API calls for object detection, OCR, and scene description.
 * 
 * Key design:
 * - Detection (/pipeline) is for visual overlays only
 * - Live mode (/live) is for blocking narrative descriptions
 * - These are separate concerns with different polling behaviors
 */

import { useState, useCallback, useRef } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || '';

export function useDetection() {
  const [detections, setDetections] = useState([]);
  const [latency, setLatency] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false); // Separate flag for detection
  const [lastNarrative, setLastNarrative] = useState('');
  
  const timestampRef = useRef(0);
  
  /**
   * Run detection for visual overlays only (no speech)
   * Fast endpoint for bounding box rendering - runs independently of narration
   */
  const processFrame = useCallback(async (frameBase64) => {
    // Use separate isDetecting flag so detection can run while narration is processing
    if (isDetecting) return null;
    
    setIsDetecting(true);
    
    try {
      timestampRef.current = Date.now() / 1000;
      
      const response = await fetch(`${API_BASE}/pipeline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: frameBase64,
          timestamp: timestampRef.current
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      setDetections(data.detections || []);
      setLatency(data.timing?.total_ms || 0);
      
      return data;
      
    } catch (err) {
      console.error('Detection error:', err);
      return null;
    } finally {
      setIsDetecting(false);
    }
  }, [isDetecting]);
  
  /**
   * Live mode - get scene narrative (blocking call)
   * Returns narrative text for TTS, plus detections for overlays
   */
  const getLiveNarrative = useCallback(async (frameBase64) => {
    setIsProcessing(true);
    
    try {
      const response = await fetch(`${API_BASE}/live`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: frameBase64,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update detections for overlay
      setDetections(data.detections || []);
      setLatency(data.timing?.total_ms || 0);
      setLastNarrative(data.narrative || '');
      
      return {
        narrative: data.narrative,
        detections: data.detections,
        timing: data.timing
      };
      
    } catch (err) {
      console.error('Live mode error:', err);
      return {
        narrative: 'I encountered an error while analyzing the scene.',
        detections: [],
        timing: { total_ms: 0 }
      };
    } finally {
      setIsProcessing(false);
    }
  }, []);
  
  /**
   * Read text from image with natural narration
   */
  const readText = useCallback(async (frameBase64) => {
    setIsProcessing(true);
    
    try {
      const response = await fetch(`${API_BASE}/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: frameBase64,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.text || 'No text detected';
      
    } catch (err) {
      console.error('OCR error:', err);
      return 'Error reading text';
    } finally {
      setIsProcessing(false);
    }
  }, []);
  
  /**
   * Get rich scene description (on-demand, not live mode)
   */
  const describeScene = useCallback(async (frameBase64) => {
    setIsProcessing(true);
    
    try {
      const response = await fetch(`${API_BASE}/describe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: frameBase64,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.description || 'Unable to describe scene';
      
    } catch (err) {
      console.error('Describe error:', err);
      return 'Error describing scene';
    } finally {
      setIsProcessing(false);
    }
  }, []);
  
  /**
   * Get detailed scene description with OCR and comprehensive information
   */
  const describeSceneDetailed = useCallback(async (frameBase64) => {
    setIsProcessing(true);
    
    try {
      const response = await fetch(`${API_BASE}/describe/detailed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: frameBase64,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update detections for overlay
      if (data.detections) {
        setDetections(data.detections);
      }
      if (data.timing?.total_ms) {
        setLatency(data.timing.total_ms);
      }
      
      return {
        description: data.description || 'Unable to describe scene in detail',
        ocrText: data.ocr_text,
        timing: data.timing
      };
      
    } catch (err) {
      console.error('Detailed describe error:', err);
      return {
        description: 'Error getting detailed scene description',
        ocrText: null,
        timing: null
      };
    } finally {
      setIsProcessing(false);
    }
  }, []);
  
  return {
    detections,
    latency,
    lastNarrative,
    processFrame,
    getLiveNarrative,  // New blocking live mode
    readText,
    describeScene,
    describeSceneDetailed,  // New detailed description
    isProcessing
  };
}
