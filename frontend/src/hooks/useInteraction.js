/**
 * useInteraction Hook
 * Manages interaction recording state and audio capture.
 * Uses Web Speech API for real-time browser-based transcription.
 */

import { useState, useCallback, useRef } from 'react';
import { startInteraction, stopInteraction } from '../services/memoryApi';

// Check if Web Speech API is available
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechAvailable = !!SpeechRecognition;

export function useInteraction() {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState('');  // Real-time transcript display
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef('');  // Accumulates final transcript
  
  /**
   * Start recording an interaction
   * Uses Web Speech API for real-time transcription
   */
  const startRecording = useCallback(async () => {
    setError(null);
    setLiveTranscript('');
    transcriptRef.current = '';
    
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      streamRef.current = stream;
      
      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Set up Web Speech API for real-time transcription
      if (speechAvailable) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }
          
          // Accumulate final results
          if (finalTranscript) {
            transcriptRef.current += finalTranscript;
          }
          
          // Show live transcript (final + interim)
          setLiveTranscript(transcriptRef.current + interimTranscript);
        };
        
        recognition.onerror = (event) => {
          console.warn('Speech recognition error:', event.error);
          // Don't fail completely - just log the error
        };
        
        recognition.onend = () => {
          // Restart if still recording (speech API auto-stops after silence)
          if (isRecording && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.warn('Failed to restart speech recognition:', e);
            }
          }
        };
        
        recognitionRef.current = recognition;
        recognition.start();
        console.log('Web Speech API started');
      } else {
        console.warn('Web Speech API not available - transcription disabled');
      }
      
      // Start backend session
      const response = await startInteraction();
      setSessionId(response.session_id);
      
      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      
      console.log('Recording started, session:', response.session_id);
      
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError(err.message);
      throw err;
    }
  }, [isRecording]);
  
  /**
   * Stop recording and process the interaction
   * @param {string|null} faceImageBase64 - Optional face image for recognition
   * @param {boolean} saveAudio - Whether to save the audio file
   */
  const stopRecording = useCallback(async (faceImageBase64 = null, saveAudio = false) => {
    if (!isRecording || !mediaRecorderRef.current) {
      return null;
    }
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Stop speech recognition first
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;  // Prevent auto-restart
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      
      // Get final transcript - use liveTranscript state which includes both final and interim results
      // This ensures we capture any speech that hasn't been finalized yet
      const finalTranscript = liveTranscript.trim() || transcriptRef.current.trim();
      console.log('Final transcript:', finalTranscript);
      
      // Stop MediaRecorder
      const mediaRecorder = mediaRecorderRef.current;
      
      // Wait for final data
      await new Promise((resolve) => {
        mediaRecorder.onstop = resolve;
        mediaRecorder.stop();
      });
      
      // Stop microphone stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Create audio blob
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      console.log('Audio recorded:', audioBlob.size, 'bytes');
      
      // Send to backend for processing - include transcript from Web Speech API
      const result = await stopInteraction(
        sessionId,
        audioBlob,
        faceImageBase64,
        saveAudio,
        finalTranscript  // Send browser-transcribed text
      );
      
      console.log('Interaction processed:', result);
      setLastResult(result);
      setIsRecording(false);
      setSessionId(null);
      setLiveTranscript('');
      
      return result;
      
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsProcessing(false);
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      transcriptRef.current = '';
    }
  }, [isRecording, sessionId, liveTranscript]);
  
  /**
   * Cancel recording without processing
   */
  const cancelRecording = useCallback(() => {
    // Stop speech recognition
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsRecording(false);
    setSessionId(null);
    setIsProcessing(false);
    setLiveTranscript('');
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    transcriptRef.current = '';
  }, []);
  
  return {
    isRecording,
    isProcessing,
    error,
    lastResult,
    liveTranscript,
    speechAvailable,
    startRecording,
    stopRecording,
    cancelRecording
  };
}
