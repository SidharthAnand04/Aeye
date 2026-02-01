/**
 * Memory API Service - People and Interaction Management
 */

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Start a new interaction recording session
 */
export async function startInteraction() {
  const response = await fetch(`${API_BASE}/memory/interaction/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  if (!response.ok) {
    throw new Error(`Start interaction error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Stop an interaction and process it
 * @param {string} sessionId - The session ID from startInteraction
 * @param {Blob} audioBlob - The recorded audio blob
 * @param {string|null} faceImageBase64 - Base64 encoded face image
 * @param {boolean} saveAudio - Whether to save the audio file
 * @param {string} transcript - Browser-transcribed text from Web Speech API
 */
export async function stopInteraction(sessionId, audioBlob, faceImageBase64, saveAudio = false, transcript = '') {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('save_audio', saveAudio.toString());
  
  // Include browser transcript from Web Speech API
  if (transcript) {
    formData.append('transcript', transcript);
  }
  
  if (audioBlob) {
    formData.append('audio', audioBlob, 'recording.webm');
  }
  
  if (faceImageBase64) {
    formData.append('face_image', faceImageBase64);
  }
  
  const response = await fetch(`${API_BASE}/memory/interaction/stop`, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stop interaction error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

/**
 * Get all people
 */
export async function getPeople() {
  const response = await fetch(`${API_BASE}/memory/people`);
  
  if (!response.ok) {
    throw new Error(`Get people error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Get a single person by ID
 */
export async function getPerson(personId) {
  const response = await fetch(`${API_BASE}/memory/people/${personId}`);
  
  if (!response.ok) {
    throw new Error(`Get person error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Get all interactions for a person
 */
export async function getPersonInteractions(personId) {
  const response = await fetch(`${API_BASE}/memory/people/${personId}/interactions`);
  
  if (!response.ok) {
    throw new Error(`Get interactions error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Rename a person
 */
export async function renamePerson(personId, newName) {
  const response = await fetch(`${API_BASE}/memory/people/${personId}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName })
  });
  
  if (!response.ok) {
    throw new Error(`Rename error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Resolve an unknown person to a name (optionally merge with existing)
 */
export async function resolvePerson(unknownPersonId, newName, mergeWithPersonId = null) {
  const response = await fetch(`${API_BASE}/memory/people/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      unknown_person_id: unknownPersonId,
      new_name: newName,
      merge_with_person_id: mergeWithPersonId
    })
  });
  
  if (!response.ok) {
    throw new Error(`Resolve error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Delete a person
 */
export async function deletePerson(personId) {
  const response = await fetch(`${API_BASE}/memory/people/${personId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error(`Delete error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Get audio URL for an interaction
 */
export function getInteractionAudioUrl(interactionId) {
  return `${API_BASE}/memory/interactions/${interactionId}/audio`;
}

/**
 * Get photo URL for a person
 */
export function getPersonPhotoUrl(personId) {
  return `${API_BASE}/memory/people/${personId}/photo`;
}
