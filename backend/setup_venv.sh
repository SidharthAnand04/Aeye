#!/bin/bash
# Setup script for pip/venv

echo "Setting up Aeye backend with pip/venv..."

# Create virtual environment
python -m venv venv

# Activate virtual environment
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    source venv/Scripts/activate
else
    # Linux/Mac
    source venv/bin/activate
fi

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

echo "Setup complete! Activate the environment with:"
echo "  Windows: venv\\Scripts\\activate"
echo "  Linux/Mac: source venv/bin/activate"
echo ""
echo "Then run the server with:"
echo "  python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
