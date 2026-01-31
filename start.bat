@echo off
REM Aeye - Windows Startup Script
REM Starts both backend and frontend servers

echo ========================================
echo    Aeye - Assistive Vision System
echo ========================================
echo.

REM Check if .env exists
if not exist "backend\.env" (
    echo ERROR: backend\.env not found!
    echo Please copy backend\.env.example to backend\.env
    echo and add your KEYWORDS_AI_API_KEY
    pause
    exit /b 1
)

echo Starting Backend Server...
start "Aeye Backend" cmd /k "cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo Waiting for backend to start...
timeout /t 5 /nobreak > nul

echo Starting Frontend Server...
start "Aeye Frontend" cmd /k "cd frontend && npm start"

echo.
echo ========================================
echo Servers starting...
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
echo API Docs: http://localhost:8000/docs
echo ========================================
echo.
echo Press any key to exit this window...
pause > nul
