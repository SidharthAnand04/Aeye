@echo off
REM Setup script for pip/venv on Windows

echo Setting up Aeye backend with pip/venv...

REM Create virtual environment
python -m venv venv

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Upgrade pip
python -m pip install --upgrade pip

REM Install dependencies
pip install -r requirements.txt

echo.
echo Setup complete! Activate the environment with:
echo   venv\Scripts\activate
echo.
echo Then run the server with:
echo   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
