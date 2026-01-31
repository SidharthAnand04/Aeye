#!/bin/bash
# Aeye - Unix/Mac Startup Script
# Starts both backend and frontend servers

echo "========================================"
echo "   Aeye - Assistive Vision System"
echo "========================================"
echo ""

# Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo "ERROR: backend/.env not found!"
    echo "Please copy backend/.env.example to backend/.env"
    echo "and add your KEYWORDS_AI_API_KEY"
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo "Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
echo "Starting Backend Server..."
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait for backend
echo "Waiting for backend to start..."
sleep 5

# Start frontend
echo "Starting Frontend Server..."
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "========================================"
echo "Servers running!"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo "API Docs: http://localhost:8000/docs"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for processes
wait
