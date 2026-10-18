"""
Application configuration and settings.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    APP_NAME: str = "AstroAI Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # API
    API_V1_PREFIX: str = "/api/v1"

    # Security
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # RAG
    VECTORSTORE_PATH: str = "data/vectorstore"
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 128
    TOP_K_RETRIEVAL: int = 5

    # LLM (placeholder for production)
    LLM_PROVIDER: str = "fallback"  # options: openai, huggingface, local
    OPENAI_API_KEY: str = ""
    HUGGINGFACE_API_KEY: str = ""
    HUGGINGFACE_MODEL: str = "mistralai/Mistral-7B-Instruct-v0.2"

    # Database
    DATABASE_URL: str = "postgresql://astro:astro@localhost:5432/astroai"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Swiss Ephemeris
    EPHE_PATH: str = "data/ephemeris"

    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache()
def get_settings() -> Settings:
    return Settings()
