# Aeye — Real-time Assistive Vision for Blind & Low-Vision Users

Camera-based AI assistant that detects obstacles, reads text, and describes scenes—all in real time with spoken feedback.

> 🏆 Built for Keywords AI Hackathon 2026

## Demo

<div align="center">
  <a href="https://www.youtube.com/watch?v=FT2MSTotdO0" target="_blank">
    <img src="https://img.youtube.com/vi/FT2MSTotdO0/maxresdefault.jpg" alt="Aeye Demo Video" width="560">
  </a>
</div>

---

## Quick Start

### Prerequisites
- Python 3.10+ with [uv](https://github.com/astral-sh/uv)
- Node.js 18+
- Keywords AI API key

### 1. Backend Setup
```bash
cd backend
uv sync
cp .env.example .env
# Edit .env with your KEYWORDS_AI_API_KEY
uv run uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm start
```

### 3. Open http://localhost:3000

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Camera     │  │  Bounding   │  │  Control    │  │  Trace      │    │
│  │  Stream     │  │  Box        │  │  Panel      │  │  Panel      │    │
│  │  (1-5 FPS)  │  │  Overlay    │  │             │  │  (Judges)   │    │
│  └──────┬──────┘  └──────▲──────┘  └──────┬──────┘  └──────▲──────┘    │
│         │                │                │                │            │
│         │  base64 frame  │  detections    │                │  trace     │
│         ▼                │                ▼                │            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    useDetection Hook                              │  │
│  │  processFrame() │ readText() │ describeScene()                    │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│         │                       │                                       │
│         │   Web Speech API      │                                       │
│         ▼                       ▼                                       │
│  ┌─────────────┐         ┌─────────────┐                               │
│  │  useSpeech  │         │  HTTP POST  │                               │
│  │  (TTS)      │         │  /pipeline  │                               │
│  └─────────────┘         └──────┬──────┘                               │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (FastAPI)                              │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        API Endpoints                                │ │
│  │  POST /pipeline │ POST /detect │ POST /ocr │ POST /describe        │ │
│  └────────────────────────────────┬───────────────────────────────────┘ │
│                                   │                                      │
│  ┌────────────────────────────────▼───────────────────────────────────┐ │
│  │                      PERCEPTION LAYER                               │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │  YOLOv8n     │  │  EasyOCR     │  │  IOU         │              │ │
│  │  │  Detector    │  │  Engine      │  │  Tracker     │              │ │
│  │  │  (~100ms)    │  │  (~350ms)    │  │  (~5ms)      │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────┬───────────────────────────────────┘ │
│                                   │                                      │
│  ┌────────────────────────────────▼───────────────────────────────────┐ │
│  │                        AGENT LAYER                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │  Priority    │  │  Novelty &   │  │  Speech      │              │ │
│  │  │  Scoring     │  │  Cooldown    │  │  Generation  │              │ │
│  │  │              │  │  Gates       │  │              │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────┬───────────────────────────────────┘ │
│                                   │                                      │
│  ┌────────────────────────────────▼───────────────────────────────────┐ │
│  │                      KEYWORDS AI CLIENT                             │ │
│  │  Claude Haiku via Keywords AI API                                   │ │
│  │  - Scene descriptions                                               │ │
│  │  - Tool calling (speak_alert, describe_scene)                       │ │
│  │  - Trace logging                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## MVP Features

### 1. Real-time object detection
- Detect: person, car, bike, dog, chair, doors, stairs
- Shows bounding boxes in UI (for judges)
- Speaks key detections for accessibility
- Updates continuously (1–5 FPS)

### 2. Smart audio notifications
- **Priority rules**: moving obstacles near center > static clutter > background
- **Cooldowns**: don't repeat "person" every frame
- **Novelty triggers**: only speak when something changes (new object / gets close / enters path)
- Result: fewer false alerts, more useful warnings

### 3. On-demand "Describe scene"
- User presses button or voice command
- Returns short summary: *"Two people ahead. Door on the right. Chair in the middle."*
- Speaks result immediately

### 4. Text reading mode (OCR)
- User taps "Read text" → capture frame → OCR → speak
- Handles labels, signs, menus
- Quick and demoable

### 5. Voice booster
- Press-and-hold to talk
- Speech-to-text → re-speak with louder TTS
- Quick phrase buttons: *"Excuse me"*, *"Can you help me find…"*, *"I can't see well."*

## Architecture

[ Camera / Glasses Feed ]
↓
[ Perception Layer ] (object detection, OCR, STT)
↓
[ Agent / Reasoning Layer ] (prioritization, novelty triggers, cooldowns)
↓
[ Output Layer ] (audio feedback + judge UI)

## Data interfaces

Perception → Agent (detections)

Example (normalized bbox = [x1, y1, x2, y2]):

```yaml
t: 1730.24
detections:
	- label: person
		conf: 0.91
		bbox: [0.42, 0.18, 0.62, 0.92]
	- label: chair
		conf: 0.77
		bbox: [0.10, 0.55, 0.28, 0.90]
```

Agent → Output (action)

```yaml
t: 1730.40
action: SPEAK
text: "Person ahead, slightly right."
trace:
	top_objects:
		- id: 3
			label: person
			score: 2.31
			reasons: [in_path, approaching]
	gates:
		novelty: true
		cooldown_ok: true
		global_rate_ok: true
```

## Agent design (summary)

- World state: per-object memory (id, label, smoothed bbox, last_seen, last_spoken, motion/proximity proxies)
- Tracking: simple IOU matching is sufficient for MVP
- Prioritization score: class weight, in-path weight, proximity, approach, motion
- Novelty triggers: speak when new/entered path/near/approaching
- Cooldowns & rate limits: per-object ~3–6s, per-class optional, global cap ~1.2–2.0s; override on risk

## Output templates

- Alerts: “Person ahead”, “Obstacle in path”, “Bike approaching left”
- Escalation: “Very close”
- Find mode guidance: “Left”, “Right”, “Forward”

## Modes & UI

- Live Assist — continuous prioritized alerts
- Read Text — capture & read OCR text
- Describe — capture & summarize scene
- Optional: Find mode (target search)

## Suggested backend endpoints

- `POST /detect` — input: image frame → output: detections
- `POST /ocr` — input: image frame → output: text
- `POST /describe` — input: image frame → output: short summary
- `POST /agent/step` — input: t, detections, mode, settings → output: action, text, trace

## Build plan (hackathon timeline)

Phase 1 — End-to-end loop

- Camera stream @ 1–5 FPS
- Draw boxes in UI
- Implement agent scoring & speak gating
- Speech log

Phase 2 — On-demand tools

- Read Text (OCR)
- Describe Scene

Phase 3 — Polish for judges

- Settings (verbosity, rate, mute)
- Trace panel with gates & top objects
- Record ≤2 minute demo video

## Demo script (≈2 minutes)

1. Live Assist: show clutter; agent speaks only key items
2. Approach scenario: person enters view → one announcement; move closer → escalate
3. Read Text: point at sign, tap Read, it speaks
4. Describe: tap Describe, it summarizes
5. Optional: Voice Booster demo

## Safety & privacy

- Default: do not store raw frames
- Log only structured events (detections, spoken text) for replay
- Provide visible indicator when camera processing is active

## Tech stack (suggested)

- Frontend: web app (camera + TTS)
- Backend: FastAPI / Flask
- Storage: Supabase (settings + logs)
- Orchestration: Keywords AI (tool calls + trace)

## Success metrics (for Devpost)

- Speech rate: ≤ 1 message / ~1.5s
- Alert usefulness: announces only when novel/risky
- Navigation proxy: fewer spam repeats, accurate directional cues
- Demo reliability: works in noisy room; optional visual fallback

