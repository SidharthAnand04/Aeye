/**
 * PersonDetail Component
 * Shows details and interaction history for a person.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getPersonInteractions, getInteractionAudioUrl, renamePerson, getPersonPhotoUrl } from '../services/memoryApi';
import './PersonDetail.css';

function PersonDetail({ personId, onBack, onRefresh }) {
  const [person, setPerson] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  
  // Load person and interactions
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getPersonInteractions(personId);
      setPerson(response.person);
      setInteractions(response.interactions || []);
      setNewName(response.person?.name || '');
      setError(null);
    } catch (err) {
      console.error('Failed to load person:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [personId]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Handle rename
  const handleSaveName = async () => {
    try {
      await renamePerson(personId, newName);
      setEditingName(false);
      await loadData();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to rename:', err);
    }
  };
  
  // Format date
  const formatDateTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString();
  };
  
  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };
  
  if (loading) {
    return (
      <div className="person-detail">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <div className="detail-loading">Loading...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="person-detail">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <div className="detail-error">⚠️ {error}</div>
      </div>
    );
  }
  
  if (!person) {
    return (
      <div className="person-detail">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <div className="detail-error">Person not found</div>
      </div>
    );
  }
  
  return (
    <div className="person-detail">
      {/* Header */}
      <div className="detail-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        
        <div className="detail-info">
          <div className="detail-avatar">
            {person.has_face ? (
              <img 
                src={getPersonPhotoUrl(person.id)} 
                alt={person.name}
                className="avatar-photo"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <span 
              className="avatar-fallback" 
              style={{ display: person.has_face ? 'none' : 'flex' }}
            >
              {person.name === 'Unknown' ? '?' : '👤'}
            </span>
          </div>
          
          <div className="detail-name-section">
            {editingName ? (
              <div className="edit-name-form">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  autoFocus
                />
                <button onClick={handleSaveName}>✓</button>
                <button onClick={() => setEditingName(false)}>✕</button>
              </div>
            ) : (
              <h2 className="detail-name">
                {person.name}
                <button 
                  className="btn-edit-name"
                  onClick={() => setEditingName(true)}
                >
                  ✏️
                </button>
              </h2>
            )}
            
            <div className="detail-meta">
              <span>{person.interaction_count} interactions</span>
              <span>•</span>
              <span>First seen: {formatDateTime(person.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Interactions List */}
      <div className="interactions-section">
        <h3 className="section-title">Interaction History</h3>
        
        {interactions.length === 0 ? (
          <div className="no-interactions">No interactions recorded yet.</div>
        ) : (
          <div className="interactions-list">
            {interactions.map(interaction => (
              <div 
                key={interaction.id} 
                className={`interaction-card ${expandedId === interaction.id ? 'expanded' : ''}`}
              >
                {/* Interaction Header */}
                <div 
                  className="interaction-header"
                  onClick={() => setExpandedId(
                    expandedId === interaction.id ? null : interaction.id
                  )}
                >
                  <div className="interaction-time">
                    <span className="time-date">{formatDateTime(interaction.started_at)}</span>
                    {interaction.duration_seconds && (
                      <span className="time-duration">
                        ({formatDuration(interaction.duration_seconds)})
                      </span>
                    )}
                  </div>
                  
                  <div className="interaction-summary-preview">
                    {interaction.summary?.summary || 'No summary available'}
                  </div>
                  
                  <span className="expand-icon">
                    {expandedId === interaction.id ? '▼' : '▶'}
                  </span>
                </div>
                
                {/* Expanded Content */}
                {expandedId === interaction.id && (
                  <div className="interaction-content">
                    {/* Summary */}
                    {interaction.summary && (
                      <div className="content-section">
                        <h4>Summary</h4>
                        <p>{interaction.summary.summary}</p>
                        
                        {interaction.summary.key_points?.length > 0 && (
                          <>
                            <h4>Key Points</h4>
                            <ul className="key-points">
                              {interaction.summary.key_points.map((point, i) => (
                                <li key={i}>{point}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        
                        {interaction.summary.action_items?.length > 0 && (
                          <>
                            <h4>Action Items</h4>
                            <ul className="action-items">
                              {interaction.summary.action_items.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        
                        {interaction.summary.entities?.length > 0 && (
                          <div className="entities">
                            <h4>Mentioned</h4>
                            <div className="entity-tags">
                              {interaction.summary.entities.map((entity, i) => (
                                <span key={i} className="entity-tag">{entity}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Transcript */}
                    {interaction.transcript && (
                      <div className="content-section">
                        <h4>Transcript</h4>
                        <div className="transcript-text">
                          {interaction.transcript}
                        </div>
                      </div>
                    )}
                    
                    {/* Audio Player */}
                    {interaction.audio_saved && (
                      <div className="content-section">
                        <h4>Audio Recording</h4>
                        <audio 
                          controls 
                          src={getInteractionAudioUrl(interaction.id)}
                          className="audio-player"
                        >
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    )}
                    
                    {/* Confidence */}
                    {interaction.face_confidence && (
                      <div className="confidence-info">
                        Face recognition confidence: {Math.round(interaction.face_confidence * 100)}%
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PersonDetail;
