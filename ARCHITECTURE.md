# Aeye - Complete System Documentation

## 🚀 Quick Start Guide

### Prerequisites
- **Python 3.10+** (tested with 3.13.5)
- **uv** package manager: `pip install uv`
- **Node.js 18+** and npm
- **Keywords AI API key**: Get from https://keywordsai.co

### Installation

#### 1. Backend Setup
```bash
cd backend

# Install dependencies
uv sync

# Configure environment
cp .env.example .env
# Edit .env and add: KEYWORDS_AI_API_KEY=your_actual_key_here

# Start backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**First run:** YOLOv8n model (~6.2MB) will auto-download.

#### 2. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start frontend
npm start
```

Frontend opens at **http://localhost:3000**

---

## 📊 System Architecture

### Data Flow
```
Camera (1-5 FPS)
    ↓ base64 JPEG
[ Frontend - React ]
    ↓ POST /pipeline
[ FastAPI Backend ]
    ↓
[ YOLOv8n Detector ] → [ IOU Tracker ] → [ Agent ] → [ Keywords AI ]
    ↓                      ↓                ↓
Detections           Track IDs        Decision + Text
    ↓                      ↓                ↓
[ Frontend Overlay ] [ Agent State ] [ TTS (Web Speech API) ]
```

### Backend Components

| Component | File | Purpose | Latency |
|-----------|------|---------|---------|
| **Detection** | `perception/detector.py` | YOLOv8n object detection | ~100ms |
| **Tracking** | `perception/tracker.py` | IOU-based persistent IDs | ~5ms |
| **OCR** | `perception/ocr.py` | EasyOCR text reading | ~350ms |
| **Agent** | `agent/reasoning.py` | Priority scoring + gates | ~10ms |
| **Keywords AI** | `agent/keywords_client.py` | Scene description (Haiku) | ~300ms |

### ML Model Selection

#### YOLOv8n - Object Detection
- **Size**: 6.2MB
- **Parameters**: 3.2M
- **Inference**: 80-120ms CPU, 10-20ms GPU
- **Classes**: person, car, bike, dog, chair (7 total)
- **Trade-off**: Speed > Accuracy for real-time

#### EasyOCR - Text Recognition
- **Languages**: English (configurable)
- **Inference**: 300-400ms
- **Use case**: Signs, labels, menus
- **Alternative considered**: Tesseract (faster but less accurate on scene text)

#### Claude Haiku via Keywords AI
- **Model**: claude-3-5-haiku-20241022
- **Purpose**: Scene descriptions, tool calling
- **Inference**: 200-400ms
- **Why Haiku**: Fast + cheap for real-time use

---

## 🎯 Agent Logic Deep Dive

### Priority Scoring
```python
score = class_weight + in_path_weight + proximity + approach + motion + novelty
```

| Factor | Weight | Trigger |
|--------|--------|---------|
| Class | 0.5-1.2 | car > person > chair |
| In-path | +1.0 | Center of frame (x: 0.35-0.65) |
| Proximity | +0.5 to +2.0 | Bbox area > 0.05 |
| Approaching | +1.5 | velocity_y > 0.05 |
| Motion | +0.5 | abs(velocity) > 0.03 |
| Novelty | +0.5 | First seen this session |

### Gate Logic
```
Should speak? = (novelty AND cooldown_ok AND global_rate_ok) OR proximity_override
```

| Gate | Threshold | Purpose |
|------|-----------|---------|
| **Novelty** | New/changed | Avoid repeating same info |
| **Object Cooldown** | 4.0s | Per-object rate limit |
| **Global Rate** | 1.5s | System-wide minimum gap |
| **Proximity Override** | Area > 0.25 + approaching | Urgent alerts bypass gates |

### Speech Templates
```python
# Normal alert
"{label} {distance}, {position}"
# "Person close, ahead"

# Urgent proximity
"Careful! {label} very close, {position}"
# "Careful! Car very close, on your right"
```

---

## 🔌 API Reference

### Base URL
```
http://localhost:8000
```

### Endpoints

#### 1. Health Check
```http
GET /health

Response:
{
  "status": "ok",
  "version": "0.1.0",
  "models_loaded": true
}
```

#### 2. Full Pipeline (Recommended)
```http
POST /pipeline

Request:
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQ...",
  "timestamp": 1738339200.5
}

Response:
{
  "timestamp": 1738339200.5,
  "detections": [
    {
      "label": "person",
      "confidence": 0.91,
      "bbox": {"x1": 0.42, "y1": 0.18, "x2": 0.62, "y2": 0.92},
      "track_id": 3
    }
  ],
  "agent": {
    "timestamp": 1738339200.5,
    "action": "SPEAK",
    "text": "Person ahead.",
    "trace": {
      "top_objects": [
        {
          "id": 3,
          "label": "person",
          "score": 4.31,
          "reasons": ["in_path", "close", "new"]
        }
      ],
      "gates": {
        "novelty": true,
        "cooldown_ok": true,
        "global_rate_ok": true,
        "proximity_override": false
      },
      "decision_reason": "all_gates_passed"
    }
  },
  "timing": {
    "detection_ms": 105.2,
    "total_ms": 182.4
  }
}
```

#### 3. OCR
```http
POST /ocr

Request:
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQ..."
}

Response:
{
  "text": "EXIT →",
  "confidence": 0.87,
  "inference_time_ms": 342.1
}
```

#### 4. Scene Description
```http
POST /describe

Request:
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQ..."
}

Response:
{
  "description": "Two people ahead. A chair on the left. The path is mostly clear.",
  "inference_time_ms": 521.8
}
```

---

## 🎨 Frontend Features

### Accessibility
- **High contrast**: Dark theme with WCAG AAA compliance
- **Large buttons**: 60px+ touch targets
- **Screen reader**: ARIA labels + live regions
- **Keyboard nav**: Full keyboard support
- **Audio-first**: TTS for all feedback

### Components

| Component | Purpose |
|-----------|---------|
| **CameraView** | Video stream + bounding box overlay |
| **ControlPanel** | Mode selection, start/stop, settings |
| **TracePanel** | Agent decision transparency (judges) |
| **SpeechLog** | History of spoken alerts |
| **StatusBar** | System status indicators |

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useCamera` | Webcam access + frame capture |
| `useDetection` | API calls for detection/OCR/describe |
| `useSpeech` | Web Speech API TTS |

---

## ⚙️ Configuration

### Backend (.env)
```bash
# Required
KEYWORDS_AI_API_KEY=kw_xxxxxxxxxxxxx

# Model Config
YOLO_MODEL=yolov8n.pt
YOLO_CONFIDENCE_THRESHOLD=0.5
OCR_LANGUAGES=en

# Agent Tuning
AGENT_COOLDOWN_SECONDS=4.0
AGENT_GLOBAL_RATE_LIMIT_SECONDS=1.5
AGENT_PROXIMITY_OVERRIDE_THRESHOLD=0.15

# Server
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Debug
DEBUG=true
LOG_LEVEL=INFO
```

### Frontend (.env.local)
```bash
REACT_APP_API_URL=http://localhost:8000
```

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check pyproject.toml has correct package config
[tool.hatch.build.targets.wheel]
packages = ["app"]

# Reinstall
uv sync --reinstall
```

### Camera not working
- Grant browser camera permissions
- Check HTTPS (required for camera API)
- Test with: `navigator.mediaDevices.getUserMedia({video: true})`

### Keywords AI errors
- Verify API key in `.env`
- Check https://keywordsai.co dashboard for quota
- Fallback: agent will use rule-based descriptions

### Slow detection
- Lower FPS in settings (default 3 FPS)
- YOLOv8n inference: ~100ms CPU
- Use GPU if available (automatic detection)

---

## 📝 Demo Script

See [DEMO.md](DEMO.md) for full 2-minute demo flow.

### Quick Demo
1. Start camera → Start Live Assist
2. Move objects → Hear smart alerts
3. Show Trace Panel → Explain gates
4. Read Text mode → Point at sign
5. Describe mode → Get scene summary

---

## 🏗️ Development

### Backend Testing
```bash
cd backend

# Run tests
uv run pytest

# API docs
# Visit http://localhost:8000/docs (Swagger UI)

# Reset agent state
curl -X POST http://localhost:8000/agent/reset
```

### Frontend Development
```bash
cd frontend

# Start dev server
npm start

# Build production
npm run build

# Test build
npm run test
```

---

## 📦 Production Deployment

### Backend
```bash
# Use production WSGI server
uv run gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker

# Docker (optional)
docker build -t aeye-backend backend/
docker run -p 8000:8000 --env-file backend/.env aeye-backend
```

### Frontend
```bash
cd frontend
npm run build

# Serve build/
# Deploy to Vercel, Netlify, or static host
```

---

## 🔒 Privacy & Security

- **No frame storage**: Images processed in-memory only
- **No personal data**: Only detection metadata logged
- **Local TTS**: Audio stays on device
- **HTTPS required**: For camera access
- **CORS**: Restrict to known origins

---

## 📚 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | FastAPI | Fast, async, type-safe |
| **Package Manager** | uv | 10-100x faster than pip |
| **Detection** | YOLOv8n | Real-time, CPU-friendly |
| **OCR** | EasyOCR | Scene text accuracy |
| **LLM** | Claude Haiku | Fast + cheap via Keywords AI |
| **Frontend** | React | Component architecture |
| **TTS** | Web Speech API | Zero latency, privacy |

---

## 🎯 Success Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Detection latency | <150ms | ~100ms |
| Full pipeline | <300ms | ~180ms |
| Speech rate | <1 per 1.5s | Enforced by gates |
| False positive rate | Minimize | Novelty + cooldowns |
| Demo reliability | 100% | High (fallbacks implemented) |

---

## 🚧 Future Enhancements

1. **Depth estimation**: Monocular depth for true distance
2. **Voice commands**: "Find the door", "Where am I?"
3. **Indoor navigation**: Room mapping + pathfinding
4. **Object search**: "Find my keys"
5. **Multi-language**: OCR + TTS in 50+ languages
6. **Mobile app**: React Native port
7. **Edge deployment**: TensorFlow Lite on mobile

---

## 📄 License

MIT License - see LICENSE file

## 🤝 Contributing

This is a hackathon project. For production use, consider:
- Unit tests
- Integration tests
- CI/CD pipeline
- Monitoring & telemetry
- User studies with actual blind users

---

## 🙏 Acknowledgments

- **Keywords AI** for LLM orchestration
- **Ultralytics** for YOLOv8
- **EasyOCR** for text recognition
- **FastAPI** for modern Python APIs
- **React** for UI framework
