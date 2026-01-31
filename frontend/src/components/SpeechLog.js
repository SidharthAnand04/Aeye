/**
 * SpeechLog Component
 * Shows history of spoken alerts for debugging.
 */

import React from 'react';
import './SpeechLog.css';

function SpeechLog({ log, onClear, isSpeaking }) {
  return (
    <div className="speech-log">
      <div className="speech-log-header">
        <h3 className="speech-log-title">
          🔊 Speech Log
          {isSpeaking && <span className="speaking-indicator">Speaking...</span>}
        </h3>
        <button
          className="clear-button"
          onClick={onClear}
          aria-label="Clear speech log"
        >
          Clear
        </button>
      </div>
      
      <div className="speech-log-content">
        {log.length === 0 ? (
          <p className="log-empty">No speech yet</p>
        ) : (
          <ul className="log-list" role="log" aria-live="off">
            {log.map((entry) => (
              <li key={entry.id} className="log-entry">
                <span className="log-time">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="log-text">{entry.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SpeechLog;
