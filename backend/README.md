# Aeye Backend

Real-time assistive vision API powered by YOLOv8 and Claude Haiku.

## Quick Start

### Prerequisites
- Python 3.10+
- [uv](https://github.com/astral-sh/uv) package manager

### Setup

1. Install dependencies:
```bash
cd backend
uv sync
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Keywords AI API key
```

3. Run the server:
```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

### Health Check
```
GET /health
```

### Object Detection
```
POST /detect
Content-Type: application/json

{
  "image_base64": "data:image/jpeg;base64,...",
  "timestamp": 1234567890.123
}
```

### OCR (Text Reading)
```
POST /ocr
Content-Type: application/json

{
  "image_base64": "data:image/jpeg;base64,..."
}
```

### Scene Description
```
POST /describe
Content-Type: application/json

{
  "image_base64": "data:image/jpeg;base64,..."
}
```

### Agent Step
```
POST /agent/step
Content-Type: application/json

{
  "timestamp": 1234567890.123,
  "detections": [...],
  "mode": "live_assist"
}
```

### Combined Pipeline (Optimized)
```
POST /pipeline
Content-Type: application/json

{
  "image_base64": "data:image/jpeg;base64,...",
  "timestamp": 1234567890.123
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FastAPI App                           │
├─────────────────────────────────────────────────────────────┤
│  /detect  │  /ocr  │  /describe  │  /agent/step  │ /pipeline│
├───────────┴────────┴─────────────┴───────────────┴──────────┤
│                     Perception Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  YOLOv8n     │  │  EasyOCR     │  │  Tracker     │       │
│  │  Detector    │  │  Engine      │  │  (IOU-based) │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
├─────────────────────────────────────────────────────────────┤
│                       Agent Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Scoring     │  │  Gates       │  │  Keywords AI │       │
│  │  Engine      │  │  (Novelty,   │  │  Client      │       │
│  │              │  │   Cooldown)  │  │  (Haiku)     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Performance Targets

| Component | Target | Actual |
|-----------|--------|--------|
| Detection | <150ms | ~80-120ms |
| OCR | <500ms | ~300-400ms |
| Agent | <50ms | ~10-20ms |
| Full Pipeline | <300ms | ~150-250ms |
