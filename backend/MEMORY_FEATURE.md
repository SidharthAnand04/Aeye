# People + Conversation Memory Feature

This feature enables Aeye to recognize people, record interactions, and maintain a searchable memory of past conversations.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  InteractionRecorder ──► MediaRecorder API ──► Audio Blob               │
│         │                                           │                    │
│         ▼                                           ▼                    │
│  Camera Frame ─────────────────────────────► POST /memory/interaction/stop│
│                                                     │                    │
│  PeopleTab ◄──────────────────────────── GET /memory/people             │
│  PersonDetail ◄──────── GET /memory/people/{id}/interactions            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKEND (FastAPI)                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  /memory/interaction/stop                                                │
│       │                                                                  │
│       ├──► Whisper (STT) ──► Transcript                                 │
│       ├──► Face Recognition ──► Person ID (or Unknown)                  │
│       └──► Claude Haiku ──► Summary JSON                                │
│                │                                                         │
│                ▼                                                         │
│         SQLite (Person, Interaction tables)                             │
│         ./data/audio/ (if save_audio enabled)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## How to Run

### Backend

```bash
cd backend

# Create/sync virtual environment with uv
uv sync

# Copy environment variables
cp .env.example .env
# Edit .env and add your KEYWORDS_AI_API_KEY

# Run the server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

### First-time Setup Notes

1. **Face Recognition**: Requires `dlib` which may need cmake. On Windows:
   - Install Visual Studio Build Tools
   - Or use `pip install cmake` then `pip install face-recognition`

2. **Whisper**: First transcription will download the model (~1GB for 'base')

3. **Database**: SQLite database is auto-created at `backend/data/memory.db`

## API Endpoints

### Interaction Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/memory/interaction/start` | Start a new recording session |
| POST | `/memory/interaction/stop` | Stop recording, process audio, identify person |

### People Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/memory/people` | List all recognized people |
| GET | `/memory/people/{id}` | Get person details |
| GET | `/memory/people/{id}/interactions` | Get all interactions for a person |
| POST | `/memory/people/{id}/rename` | Rename a person |
| POST | `/memory/people/resolve` | Resolve unknown to named person |
| DELETE | `/memory/people/{id}` | Delete person and interactions |

### Interaction Details

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/memory/interactions/{id}` | Get interaction details |
| GET | `/memory/interactions/{id}/audio` | Stream saved audio file |

## Data Models

### Person
```python
{
  "id": "uuid",
  "name": "John Doe",
  "created_at": "2026-01-31T10:00:00Z",
  "last_seen_at": "2026-01-31T15:30:00Z",
  "has_face": true,
  "interaction_count": 5
}
```

### Interaction
```python
{
  "id": "uuid",
  "person_id": "uuid",
  "person_name": "John Doe",
  "started_at": "2026-01-31T15:00:00Z",
  "ended_at": "2026-01-31T15:05:00Z",
  "duration_seconds": 300.0,
  "transcript": "Hello, how are you...",
  "summary": {
    "summary": "Brief catch-up conversation about weekend plans.",
    "key_points": ["Discussed hiking trip", "Mentioned new project"],
    "action_items": ["Send trail recommendations"],
    "entities": ["Mount Rainier", "Seattle"]
  },
  "audio_saved": true,
  "face_confidence": 0.92
}
```

## Privacy Controls

- **Audio Recording**: Off by default. User must explicitly enable "Save audio" checkbox.
- **Face Recognition**: Can be disabled per-interaction. Falls back to "Unknown" person.
- **Video Frames**: Never stored. Only a single frame is captured at interaction end for face matching.

## Test Plan (Manual)

1. **Start Recording**
   - Click "Start Interaction"
   - Verify microphone permission is requested
   - Verify red recording indicator appears

2. **Stop and Process**
   - Click "Stop & Process"
   - Verify processing indicator shows
   - Verify result appears with person name and summary

3. **Check People Tab**
   - Switch to "People" tab
   - Verify new person appears in list
   - Verify interaction count shows "1 interaction"

4. **View Person Details**
   - Click on person card
   - Verify interaction history shows
   - Expand interaction to see full summary

5. **Rename Person**
   - Click edit icon on "Unknown" person
   - Enter a name and save
   - Verify name updates in list

6. **Audio Playback** (if save_audio was enabled)
   - Expand interaction
   - Verify audio player appears
   - Play audio to confirm recording

## File Structure

```
backend/
  app/
    memory/
      __init__.py         # Module exports
      models.py           # SQLAlchemy + Pydantic models
      database.py         # SQLite setup
      service.py          # Main orchestrator
      face_service.py     # Face detection/matching
      transcription.py    # Whisper STT
      summarizer.py       # Claude Haiku summaries
    routes/
      memory.py           # API endpoints
  data/
    audio/                # Saved audio files
    faces/                # Reference face images
    memory.db             # SQLite database

frontend/
  src/
    components/
      InteractionRecorder.js/.css
      PeopleTab.js/.css
      PersonDetail.js/.css
    hooks/
      useInteraction.js
    services/
      memoryApi.js
```

## Dependencies Added

### Backend (pyproject.toml)
- `sqlalchemy>=2.0.0` - Database ORM
- `openai-whisper>=20231117` - Speech-to-text
- `face-recognition>=1.3.0` - Face detection/matching

### Frontend (already using React + existing deps)
- Uses native MediaRecorder API
- No additional packages needed
