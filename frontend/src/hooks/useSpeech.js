/**
 * useSpeech Hook
 * Handles Text-to-Speech using Web Speech API.
 * 
 * Design decision: Browser TTS is used because:
 * 1. Zero latency (no network round-trip)
 * 2. Works offline
 * 3. Privacy (audio stays local)
 * 4. Good voice quality in modern browsers
 * 
 * Key feature: Blocking speech with onComplete callback
 * - Live mode uses this to wait for speech to finish
 * - Prevents narration overlap and mid-sentence cutoffs
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechLog, setSpeechLog] = useState([]);
  const synthRef = useRef(null);
  const voiceRef = useRef(null);
  const onCompleteRef = useRef(null);
  
  // Initialize speech synthesis
  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    
    // Get available voices
    const loadVoices = () => {
      const voices = synthRef.current.getVoices();
      // Prefer a clear English voice
      voiceRef.current = voices.find(v => 
        v.lang.startsWith('en') && v.name.includes('Google')
      ) || voices.find(v => 
        v.lang.startsWith('en')
      ) || voices[0];
    };
    
    loadVoices();
    synthRef.current.onvoiceschanged = loadVoices;
    
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);
  
  /**
   * Speak text with optional completion callback
   * @param {string} text - Text to speak
   * @param {Object} options - Speech options
   * @param {number} options.rate - Speech rate (default 1.0)
   * @param {number} options.pitch - Speech pitch (default 1.0)
   * @param {number} options.volume - Speech volume (default 1.0)
   * @param {Function} options.onComplete - Callback when speech finishes
   */
  const speak = useCallback((text, options = {}) => {
    if (!synthRef.current || !text) {
      // If no text, call onComplete immediately
      if (options.onComplete) {
        options.onComplete();
      }
      return;
    }
    
    // Cancel any ongoing speech
    synthRef.current.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure utterance
    utterance.voice = voiceRef.current;
    utterance.rate = options.rate || 1.0;  // Normal speed
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume || 1.0;
    
    // Store completion callback
    onCompleteRef.current = options.onComplete;
    
    // Event handlers
    utterance.onstart = () => setIsSpeaking(true);
    
    utterance.onend = () => {
      setIsSpeaking(false);
      // Call completion callback if provided
      if (onCompleteRef.current) {
        onCompleteRef.current();
        onCompleteRef.current = null;
      }
    };
    
    utterance.onerror = (event) => {
      console.error('Speech error:', event.error);
      setIsSpeaking(false);
      // Call completion callback even on error
      if (onCompleteRef.current) {
        onCompleteRef.current();
        onCompleteRef.current = null;
      }
    };
    
    // Add to log
    setSpeechLog(prev => [
      {
        text,
        timestamp: new Date().toISOString(),
        id: Date.now()
      },
      ...prev.slice(0, 49) // Keep last 50 entries
    ]);
    
    // Speak
    synthRef.current.speak(utterance);
  }, []);
  
  /**
   * Speak and return a promise that resolves when speech completes
   * This is the BLOCKING speech method for live mode
   */
  const speakAndWait = useCallback((text, options = {}) => {
    return new Promise((resolve) => {
      speak(text, {
        ...options,
        onComplete: resolve
      });
    });
  }, [speak]);
  
  const stop = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
      // Clear pending callback
      if (onCompleteRef.current) {
        onCompleteRef.current = null;
      }
    }
  }, []);
  
  const clearLog = useCallback(() => {
    setSpeechLog([]);
  }, []);
  
  return {
    speak,
    speakAndWait,  // New blocking method
    stop,
    isSpeaking,
    speechLog,
    clearLog
  };
}
