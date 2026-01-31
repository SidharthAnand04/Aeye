# Aeye Demo Script

## 2-Minute Demo Flow

### Setup (before demo)
1. Ensure backend is running: `http://localhost:8000/health`
2. Ensure frontend is running: `http://localhost:3000`
3. Have props ready: a person, a chair, something with text (sign/menu)

---

## Demo Script

### 0:00-0:15 - Introduction
> "This is Aeye - a real-time assistive vision system for blind and low-vision users. It uses AI to detect obstacles, read text, and describe scenes, all with spoken feedback."

- Show the UI briefly
- Point out the camera view and control panel

### 0:15-0:45 - Live Assist Mode
1. Click **Start Camera**
2. Click **Start Live Assist**
3. Walk around with laptop/show objects:
   - Have a person walk into frame → *"Person ahead"*
   - Move a chair into view → *"Chair on your left"*
   - Move closer to camera → *"Careful! Person very close, ahead"*

> "Notice how it only speaks when something changes or gets closer. No spam, only useful alerts."

4. Show the **Trace Panel** on the right:
   > "Judges can see exactly why the agent decided to speak - the scoring, the gates, the reasoning."

### 0:45-1:15 - Read Text Mode
1. Switch to **Read Text** mode
2. Hold up a sign or menu
3. Click **Read Text** button
4. System reads the text aloud

> "Users can point their camera at any sign, label, or menu and have it read aloud."

### 1:15-1:40 - Describe Scene Mode
1. Switch to **Describe** mode
2. Set up a scene with multiple objects
3. Click **Describe Scene** button
4. System speaks: *"Two people ahead. A chair on the left. The area is mostly clear."*

> "This gives users a quick mental map of their surroundings on demand."

### 1:40-2:00 - Voice Booster & Wrap-up
1. Show **Quick Phrases** panel
2. Click "Excuse me" - it speaks
3. Click "Can you help me?" - it speaks

> "Quick phrases help users communicate in noisy environments."

> "Aeye runs at 1-5 FPS with under 300ms latency. It's privacy-first - no frames are stored. The agent uses Keywords AI with Claude Haiku for intelligent scene understanding."

---

## Key Points to Emphasize

1. **Smart Alerts**: Agent only speaks when novel/risky
2. **Transparency**: Trace panel shows all decisions
3. **Fast**: <300ms end-to-end latency
4. **Privacy**: No raw frame storage
5. **Accessible**: Large buttons, audio-first UX
6. **Keywords AI**: LLM-powered scene understanding

## Backup Demo (if camera issues)
- Have pre-recorded video ready
- Show API docs at `/docs`
- Walk through trace panel with mock data
