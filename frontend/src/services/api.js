/**
 * API Service - Centralized API calls
 */

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Run object detection + agent pipeline on a frame
 */
export async function runPipeline(imageBase64, timestamp) {
  const response = await fetch(`${API_BASE}/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: imageBase64,
      timestamp: timestamp
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Pipeline error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Run OCR on a frame
 */
export async function runOCR(imageBase64) {
  const response = await fetch(`${API_BASE}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  
  if (!response.ok) {
    throw new Error(`OCR error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Get scene description
 */
export async function describeScene(imageBase64) {
  const response = await fetch(`${API_BASE}/describe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  
  if (!response.ok) {
    throw new Error(`Describe error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Health check
 */
export async function checkHealth() {
  const response = await fetch(`${API_BASE}/health`);
  return response.json();
}

/**
 * Reset agent state
 */
export async function resetAgent() {
  const response = await fetch(`${API_BASE}/agent/reset`, {
    method: 'POST',
  });
  return response.json();
}
