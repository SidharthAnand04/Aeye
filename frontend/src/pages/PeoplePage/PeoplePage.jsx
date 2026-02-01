/**
 * People & Text Assistance Page
 * Combined page for people tracking and text reading
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Type, 
  Mic, 
  MicOff,
  Camera,
  RefreshCw,
  Trash2,
  Edit2,
  Check,
  X,
  Volume2,
  Play,
  ChevronLeft,
  User,
  MessageSquare,
  Clock,
  FileText
} from 'lucide-react';
import PageTransition from '../../components/layout/PageTransition';
import { 
  Button, 
  IconButton,
  SegmentedControl, 
  Card,
  CardContent,
  Toggle,
  Slider,
  Badge,
  EmptyState,
  Skeleton,
  SkeletonPersonCard,
  ProcessingIndicator,
  SpeakingIndicator
} from '../../components/ui';
import { useCamera } from '../../hooks/useCamera';
import { useInteraction } from '../../hooks/useInteraction';
import { useDetection } from '../../hooks/useDetection';
import { useSpeech } from '../../hooks/useSpeech';
import { 
  getPeople, 
  getPerson,
  getPersonInteractions,
  renamePerson, 
  deletePerson, 
  getPersonPhotoUrl 
} from '../../services/memoryApi';
import './PeoplePage.css';

const PeoplePage = () => {
  const [activeTab, setActiveTab] = useState('people');
  
  const tabOptions = [
    { value: 'people', label: 'People', icon: <Users size={16} /> },
    { value: 'text', label: 'Text Assist', icon: <Type size={16} /> },
  ];

  return (
    <PageTransition className="people-page">
      <div className="people-container">
        {/* Header */}
        <div className="page-header">
          <div className="page-header-content">
            <h1 className="page-title">
              {activeTab === 'people' ? 'People' : 'Text Assistance'}
            </h1>
            <p className="page-description">
              {activeTab === 'people' 
                ? 'Manage recognized people and conversation history'
                : 'Capture and read text from your surroundings'
              }
            </p>
          </div>
          <SegmentedControl
            options={tabOptions}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'people' ? (
            <motion.div
              key="people"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <PeopleSection />
            </motion.div>
          ) : (
            <motion.div
              key="text"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <TextSection />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
};

// People Section Component
const PeopleSection = () => {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);
  const [saveAudio, setSaveAudio] = useState(false);
  const [useFaceRecognition, setUseFaceRecognition] = useState(true);
  
  // Interaction recording
  const { videoRef, isStreaming, startCamera, stopCamera, captureFrame } = useCamera();
  const { 
    isRecording, 
    isProcessing, 
    liveTranscript, 
    speechAvailable,
    startRecording, 
    stopRecording, 
    cancelRecording 
  } = useInteraction();

  // Load people
  const loadPeople = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getPeople();
      setPeople(response.people || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  // Load person interactions
  const loadInteractions = useCallback(async (personId) => {
    try {
      setLoadingInteractions(true);
      const response = await getPersonInteractions(personId);
      setInteractions(response.interactions || []);
    } catch (err) {
      console.error('Failed to load interactions:', err);
    } finally {
      setLoadingInteractions(false);
    }
  }, []);

  // Select person
  const handleSelectPerson = useCallback(async (person) => {
    setSelectedPerson(person);
    await loadInteractions(person.id);
  }, [loadInteractions]);

  // Handle interaction recording
  const handleStartInteraction = async () => {
    if (!isStreaming) {
      await startCamera();
    }
    await startRecording();
  };

  const handleStopInteraction = async () => {
    const faceImage = isStreaming && useFaceRecognition && captureFrame ? captureFrame() : null;
    await stopRecording(faceImage, saveAudio);
    await loadPeople();
  };

  // Format date helper
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

  return (
    <div className="people-section">
      <div className="people-layout">
        {/* People List */}
        <div className="people-list-panel">
          {/* Recording Controls */}
          <Card padding="md" variant="bordered" className="recording-card">
            <h3 className="recording-title">
              <Mic size={18} />
              Record Interaction
            </h3>

            {/* Camera Preview */}
            <div className="camera-preview-container">
              <div className={`camera-preview ${isStreaming ? 'camera-preview-active' : ''}`}>
                <video 
                  ref={videoRef} 
                  className="camera-preview-video"
                  playsInline 
                  muted 
                />
                {!isStreaming && (
                  <div className="camera-preview-placeholder">
                    <Camera size={24} />
                    <span>Camera Off</span>
                  </div>
                )}
                {isRecording && (
                  <div className="camera-preview-recording">
                    <span className="recording-dot-pulse" />
                    REC
                  </div>
                )}
              </div>
              {!isStreaming ? (
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={startCamera}
                  icon={<Camera size={14} />}
                  fullWidth
                >
                  Start Camera
                </Button>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={stopCamera}
                  disabled={isRecording}
                  fullWidth
                >
                  Stop Camera
                </Button>
              )}
            </div>
            
            {isRecording && liveTranscript && (
              <div className="live-transcript">
                <MessageSquare size={14} />
                <p>{liveTranscript}</p>
              </div>
            )}

            {isProcessing && (
              <div className="processing-state">
                <ProcessingIndicator label="Processing interaction..." />
              </div>
            )}

            {/* Recording Options */}
            <div className="recording-options">
              <Toggle
                checked={useFaceRecognition}
                onChange={setUseFaceRecognition}
                label="Use Face Recognition"
                size="sm"
                disabled={isRecording || isProcessing}
              />
              <Toggle
                checked={saveAudio}
                onChange={setSaveAudio}
                label="Save Audio Recording"
                size="sm"
                disabled={isRecording || isProcessing}
              />
            </div>

            <div className="recording-actions">
              {!isRecording ? (
                <Button 
                  onClick={handleStartInteraction}
                  icon={<Mic />}
                  disabled={isProcessing}
                  fullWidth
                >
                  Start Recording
                </Button>
              ) : (
                <>
                  <Button 
                    onClick={handleStopInteraction}
                    variant="primary"
                    icon={<Check />}
                    disabled={isProcessing}
                  >
                    Stop & Save
                  </Button>
                  <Button 
                    onClick={cancelRecording}
                    variant="ghost"
                    icon={<X />}
                    disabled={isProcessing}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </Card>

          {/* People List Header */}
          <div className="list-header">
            <h3 className="list-title">All People</h3>
            <IconButton
              icon={<RefreshCw size={18} />}
              label="Refresh"
              onClick={loadPeople}
            />
          </div>

          {/* Loading State */}
          {loading && (
            <div className="people-loading">
              {[1, 2, 3].map(i => (
                <SkeletonPersonCard key={i} />
              ))}
            </div>
          )}

          {/* Error State */}
          {error && (
            <Card padding="md" variant="bordered" className="error-card">
              <p>⚠️ {error}</p>
              <Button variant="secondary" size="sm" onClick={loadPeople}>
                Retry
              </Button>
            </Card>
          )}

          {/* Empty State */}
          {!loading && people.length === 0 && (
            <EmptyState
              icon={<Users />}
              title="No people recorded"
              description="Start an interaction to begin tracking conversations."
            />
          )}

          {/* People List */}
          {!loading && people.length > 0 && (
            <div className="people-list">
              {people.map(person => (
                <PersonCard
                  key={person.id}
                  person={person}
                  selected={selectedPerson?.id === person.id}
                  onClick={() => handleSelectPerson(person)}
                  onRefresh={loadPeople}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>

        {/* Person Detail Panel */}
        <div className="person-detail-panel">
          {selectedPerson ? (
            <PersonDetail
              person={selectedPerson}
              interactions={interactions}
              loading={loadingInteractions}
              onBack={() => setSelectedPerson(null)}
              onRefresh={() => loadInteractions(selectedPerson.id)}
              formatDate={formatDate}
            />
          ) : (
            <div className="detail-placeholder">
              <User size={48} />
              <p>Select a person to view their interactions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Person Card Component
const PersonCard = ({ person, selected, onClick, onRefresh, formatDate }) => {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(person.name);

  const handleSave = async (e) => {
    e.stopPropagation();
    try {
      await renamePerson(person.id, editName);
      setEditing(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to rename:', err);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (window.confirm('Delete this person and all their interactions?')) {
      try {
        await deletePerson(person.id);
        onRefresh();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    }
  };

  return (
    <motion.div
      className={`person-card ${selected ? 'person-card-selected' : ''} ${person.name === 'Unknown' ? 'person-card-unknown' : ''}`}
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Avatar */}
      <div className="person-avatar">
        {person.has_face ? (
          <img 
            src={getPersonPhotoUrl(person.id)} 
            alt={person.name}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        ) : (
          <User size={24} />
        )}
      </div>

      {/* Info */}
      <div className="person-info">
        {editing ? (
          <div className="edit-form" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave(e);
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <IconButton icon={<Check size={14} />} label="Save" onClick={handleSave} />
            <IconButton icon={<X size={14} />} label="Cancel" onClick={() => setEditing(false)} />
          </div>
        ) : (
          <>
            <h4 className="person-name">{person.name}</h4>
            <div className="person-meta">
              <span>
                <MessageSquare size={12} />
                {person.interaction_count} interaction{person.interaction_count !== 1 ? 's' : ''}
              </span>
              <span>
                <Clock size={12} />
                {formatDate(person.last_seen_at)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      {!editing && (
        <div className="person-actions" onClick={e => e.stopPropagation()}>
          <IconButton 
            icon={<Edit2 size={14} />} 
            label="Rename" 
            onClick={() => setEditing(true)} 
          />
          <IconButton 
            icon={<Trash2 size={14} />} 
            label="Delete" 
            onClick={handleDelete} 
          />
        </div>
      )}
    </motion.div>
  );
};

// Person Detail Component
const PersonDetail = ({ person, interactions, loading, onBack, onRefresh, formatDate }) => {
  return (
    <div className="person-detail">
      {/* Header */}
      <div className="detail-header">
        <button className="back-button" onClick={onBack}>
          <ChevronLeft size={20} />
          Back
        </button>
        <IconButton
          icon={<RefreshCw size={18} />}
          label="Refresh"
          onClick={onRefresh}
        />
      </div>

      {/* Person Info */}
      <div className="detail-person">
        <div className="detail-avatar">
          {person.has_face ? (
            <img 
              src={getPersonPhotoUrl(person.id)} 
              alt={person.name}
            />
          ) : (
            <User size={48} />
          )}
        </div>
        <div className="detail-info">
          <h2 className="detail-name">{person.name}</h2>
          <div className="detail-stats">
            <Badge variant="primary">
              {person.interaction_count} interactions
            </Badge>
            <span className="detail-last-seen">
              Last seen: {formatDate(person.last_seen_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Interactions */}
      <div className="interactions-section">
        <h3 className="interactions-title">Conversation History</h3>
        
        {loading && (
          <div className="interactions-loading">
            <Skeleton height={80} />
            <Skeleton height={80} />
          </div>
        )}

        {!loading && interactions.length === 0 && (
          <EmptyState
            icon={<MessageSquare />}
            title="No interactions yet"
            description="Record a conversation to see it here."
          />
        )}

        {!loading && interactions.length > 0 && (
          <div className="interactions-list">
            {interactions.map(interaction => (
              <Card key={interaction.id} padding="md" variant="bordered" className="interaction-card">
                <div className="interaction-time">
                  <Clock size={14} />
                  {new Date(interaction.started_at).toLocaleString()}
                </div>
                {interaction.summary?.summary && (
                  <p className="interaction-summary">{interaction.summary.summary}</p>
                )}
                {interaction.transcript && (
                  <div className="interaction-transcript">
                    <div className="transcript-label">Transcript:</div>
                    <p>{interaction.transcript}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Text Section Component
const TextSection = () => {
  const { videoRef, isStreaming, startCamera, stopCamera, captureFrame } = useCamera();
  const { readText, isProcessing } = useDetection();
  const { speak, speakAndWait, isSpeaking, stop: stopSpeech } = useSpeech();
  
  const [extractedText, setExtractedText] = useState('');
  const [speechRate, setSpeechRate] = useState(1.0);

  const handleCaptureText = async () => {
    if (!isStreaming) {
      await startCamera();
      return;
    }
    
    const frame = captureFrame();
    if (!frame) return;
    
    const text = await readText(frame);
    setExtractedText(text);
  };

  const handleReadAloud = async () => {
    if (extractedText) {
      await speakAndWait(extractedText, { rate: speechRate });
    }
  };

  return (
    <div className="text-section">
      <div className="text-layout">
        {/* Camera Panel */}
        <div className="text-camera-panel">
          <Card padding="none" variant="elevated" className="text-camera-card">
            <div className="text-camera-frame">
              <video
                ref={videoRef}
                className="text-camera-video"
                playsInline
                muted
              />
              
              {!isStreaming && (
                <div className="text-camera-placeholder">
                  <Camera size={48} />
                  <p>Start camera to capture text</p>
                </div>
              )}

              {isProcessing && (
                <div className="text-camera-overlay">
                  <ProcessingIndicator label="Reading text..." />
                </div>
              )}
            </div>
          </Card>

          <div className="text-camera-controls">
            {!isStreaming ? (
              <Button onClick={startCamera} icon={<Camera />} fullWidth>
                Start Camera
              </Button>
            ) : (
              <>
                <Button 
                  onClick={handleCaptureText} 
                  icon={<FileText />}
                  disabled={isProcessing}
                  fullWidth
                >
                  Capture Text
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={stopCamera}
                >
                  Stop Camera
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Text Display Panel */}
        <div className="text-display-panel">
          <Card padding="lg" variant="bordered" className="text-display-card">
            <div className="text-display-header">
              <h3>Extracted Text</h3>
              {isSpeaking && <SpeakingIndicator />}
            </div>

            {!extractedText ? (
              <EmptyState
                icon={<Type />}
                title="No text captured"
                description="Point your camera at text and click 'Capture Text'"
              />
            ) : (
              <div className="text-content">
                <p className="extracted-text">{extractedText}</p>
              </div>
            )}

            {extractedText && (
              <div className="text-controls">
                <Slider
                  label="Speech Rate"
                  value={speechRate}
                  onChange={setSpeechRate}
                  min={0.5}
                  max={2}
                  step={0.1}
                  valueFormat={v => `${v.toFixed(1)}x`}
                />
                <div className="text-actions">
                  {!isSpeaking ? (
                    <Button 
                      onClick={handleReadAloud} 
                      icon={<Volume2 />}
                      fullWidth
                    >
                      Read Aloud
                    </Button>
                  ) : (
                    <Button 
                      onClick={stopSpeech} 
                      variant="secondary"
                      fullWidth
                    >
                      Stop Reading
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PeoplePage;
