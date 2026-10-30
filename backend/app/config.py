"""Application configuration managed via Pydantic Settings."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment configuration for AgroPulse AI backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="sqlite:///./agropulse.db",
        alias="DATABASE_URL",
        description="SQLAlchemy database connection URL.",
    )
    llm_base_url: str = Field(
        default="https://api.groq.com/openai/v1",
        alias="LLM_BASE_URL",
        description="OpenAI-compatible LLM provider base URL.",
    )
    llm_api_key: str = Field(
        default="",
        alias="LLM_API_KEY",
        description="API key for the OpenAI-compatible LLM provider.",
    )
    llm_model: str = Field(
        default="llama-3.3-70b-versatile",
        alias="LLM_MODEL",
        description="Target model identifier for tool calling.",
    )
    cors_origins: str = Field(
        default="http://localhost:3000",
        alias="CORS_ORIGINS",
        description="Comma-separated list of allowed CORS origins.",
    )
    rate_limit_max_requests: int = Field(
        default=15,
        alias="RATE_LIMIT_MAX_REQUESTS",
        description="Maximum agent requests per IP within the rate limit window.",
    )
    rate_limit_window_seconds: int = Field(
        default=3600,
        alias="RATE_LIMIT_WINDOW_SECONDS",
        description="Rate limit sliding window in seconds.",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Return parsed list of CORS origins."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
