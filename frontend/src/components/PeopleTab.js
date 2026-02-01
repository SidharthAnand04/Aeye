/**
 * PeopleTab Component
 * Displays list of recognized people and their interactions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getPeople, renamePerson, deletePerson, getPersonPhotoUrl } from '../services/memoryApi';
import PersonDetail from './PersonDetail';
import './PeopleTab.css';

function PeopleTab({ refreshTrigger }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  
  // Load people
  const loadPeople = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getPeople();
      setPeople(response.people || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load people:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    loadPeople();
  }, [loadPeople, refreshTrigger]);
  
  // Handle rename
  const handleStartEdit = (person) => {
    setEditingId(person.id);
    setEditName(person.name);
  };
  
  const handleSaveEdit = async (personId) => {
    try {
      await renamePerson(personId, editName);
      setEditingId(null);
      await loadPeople();
    } catch (err) {
      console.error('Failed to rename:', err);
    }
  };
  
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };
  
  // Handle delete
  const handleDelete = async (personId) => {
    if (!window.confirm('Delete this person and all their interactions?')) {
      return;
    }
    
    try {
      await deletePerson(personId);
      if (selectedPersonId === personId) {
        setSelectedPersonId(null);
      }
      await loadPeople();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };
  
  // Format date
  const formatDate = (isoString) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };
  
  if (selectedPersonId) {
    return (
      <PersonDetail 
        personId={selectedPersonId}
        onBack={() => setSelectedPersonId(null)}
        onRefresh={loadPeople}
      />
    );
  }
  
  return (
    <div className="people-tab">
      <div className="people-header">
        <h2 className="people-title">
          <span className="people-icon">👥</span>
          People
        </h2>
        <button 
          className="btn-refresh"
          onClick={loadPeople}
          disabled={loading}
          aria-label="Refresh people list"
        >
          🔄
        </button>
      </div>
      
      {loading && (
        <div className="people-loading">Loading...</div>
      )}
      
      {error && (
        <div className="people-error">⚠️ {error}</div>
      )}
      
      {!loading && people.length === 0 && (
        <div className="people-empty">
          <span className="empty-icon">👤</span>
          <p>No people recorded yet.</p>
          <p className="empty-hint">
            Start an interaction to begin tracking conversations.
          </p>
        </div>
      )}
      
      <div className="people-list">
        {people.map(person => (
          <div 
            key={person.id} 
            className={`person-card ${person.name === 'Unknown' ? 'unknown' : ''}`}
          >
            {/* Avatar */}
            <div className="person-avatar">
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
            
            {/* Info */}
            <div className="person-info" onClick={() => setSelectedPersonId(person.id)}>
              {editingId === person.id ? (
                <div className="edit-name-form" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveEdit(person.id);
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    autoFocus
                  />
                  <button onClick={() => handleSaveEdit(person.id)}>✓</button>
                  <button onClick={handleCancelEdit}>✕</button>
                </div>
              ) : (
                <>
                  <h3 className="person-name">{person.name}</h3>
                  <div className="person-meta">
                    <span className="meta-interactions">
                      {person.interaction_count} interaction{person.interaction_count !== 1 ? 's' : ''}
                    </span>
                    <span className="meta-separator">•</span>
                    <span className="meta-last-seen">
                      {formatDate(person.last_seen_at)}
                    </span>
                  </div>
                </>
              )}
            </div>
            
            {/* Actions */}
            <div className="person-actions">
              <button
                className="action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit(person);
                }}
                title="Rename"
              >
                ✏️
              </button>
              <button
                className="action-btn action-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(person.id);
                }}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PeopleTab;
