"""
Application configuration and settings.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    APP_NAME: str = "Placidus AI Observatory"
    APP_VERSION: str = "2.0.0"
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

    # LLM Provider — set LLM_PROVIDER=huggingface and add your HUGGINGFACE_API_KEY
    LLM_PROVIDER: str = "huggingface"  # options: openai, huggingface, local, fallback
    OPENAI_API_KEY: str = ""
    HUGGINGFACE_API_KEY: str = ""  # Required: get free key at huggingface.co/settings/tokens
    HUGGINGFACE_MODEL: str = "mistralai/Mistral-7B-Instruct-v0.2"

    # Render Keep-Alive (set this to your Render app URL to prevent sleep)
    RENDER_URL: str = ""  # e.g. https://placidus-ai.onrender.com
    KEEP_ALIVE_INTERVAL_MINUTES: int = 14  # Render free tier sleeps at 15 min

    # Swiss Ephemeris
    EPHE_PATH: str = "data/ephemeris"

    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache()
def get_settings() -> Settings:
    return Settings()
