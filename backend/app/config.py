"""
Configuration management for Aeye backend.
All secrets and settings are loaded from environment variables.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Keywords AI Configuration
    keywords_ai_api_key: str = Field(..., description="Keywords AI API key for agent orchestration")
    keywords_ai_base_url: str = Field(
        default="https://api.keywordsai.co/api",
        description="Keywords AI base URL"
    )
    
    # Model Configuration
    yolo_model: str = Field(default="yolov8n.pt", description="YOLO model file")
    yolo_confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    ocr_languages: str = Field(default="en", description="Comma-separated OCR languages")
    
    # Agent Configuration
    agent_cooldown_seconds: float = Field(default=4.0, ge=1.0, le=30.0)
    agent_global_rate_limit_seconds: float = Field(default=1.5, ge=0.5, le=10.0)
    agent_proximity_override_threshold: float = Field(default=0.15, ge=0.0, le=1.0)
    
    # IP Webcam Configuration (optional)
    ip_webcam_url: str = Field(
        default="",
        description="IP Webcam stream URL (e.g., http://192.168.1.100:8080)"
    )
    
    # Server Configuration
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    cors_origins: str = Field(default="http://localhost:3000")
    
    # Debug
    debug: bool = Field(default=False)
    log_level: str = Field(default="INFO")
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    @property
    def ocr_languages_list(self) -> List[str]:
        """Parse OCR languages from comma-separated string."""
        return [lang.strip() for lang in self.ocr_languages.split(",")]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
