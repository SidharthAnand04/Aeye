"""
Aeye Backend Entry Point
Run with: uv run uvicorn app.main:app --reload
"""

import uvicorn
from app.config import get_settings


def main():
    """Run the Aeye backend server."""
    settings = get_settings()
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
