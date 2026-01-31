# Aeye — Camera-based assistive system

Camera-based assistive system for blind and low-vision users. Converts a live video feed into short, prioritized audio cues plus on-demand OCR and scene descriptions. Includes a judge-facing UI and an agent trace for explainability.

## Table of contents

- Demo goals
- Features
- Architecture
- Data interfaces
- Agent design
- Modes & UI
- Suggested endpoints
- Build plan
- Demo script
- Safety & privacy
- Tech stack
- Success metrics

## Demo goals

- Real-time detection with concise, non-spammy audio
- On-demand: Read Text (OCR) and Describe Scene
- Optional: Find mode (directions to a target)
- Transparent agent decisions with a trace panel for judges

## Features

- Live Assist: prioritized, directional alerts (left/center/right)
- Read Text: capture frame → OCR → speak short readable text
- Describe Scene: capture frame → 1–2 sentence summary → speak
- Voice Booster (optional): hold-to-talk, STT → louder TTS
- Judge UI: live feed, bounding boxes, speech log, trace panel

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

