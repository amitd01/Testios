"""Configuration and secrets loading via pydantic-settings."""

from __future__ import annotations

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Required ──────────────────────────────────────────────────────────────
    anthropic_api_key: str = Field(..., description="Anthropic API key")
    digest_recipient: str = Field(..., description="Email address that receives the digest")
    gmail_sender: str = Field(..., description="Gmail account used to send")

    # ── Optional with defaults ─────────────────────────────────────────────────
    max_newsletters: int = Field(20, description="Max emails to process per run")
    lookback_hours: int = Field(24, description="How many hours back to fetch newsletters")
    gmail_token_file: str = Field("token.json", description="Path to OAuth token file")
    gmail_creds_file: str = Field("credentials.json", description="Path to OAuth credentials file")
    log_level: str = Field("INFO", description="Logging level (DEBUG/INFO/WARNING/ERROR)")
    log_format: str = Field("text", description="Log format: 'text' or 'json'")
    sent_digests_file: str = Field("sent_digests.json", description="Deduplication state file")

    # ── Filtering ──────────────────────────────────────────────────────────────
    blocklist_senders: str = Field(
        "",
        description="Comma-separated list of sender addresses/domains to block",
    )

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in valid:
            raise ValueError(f"log_level must be one of {valid}")
        return upper

    @field_validator("log_format")
    @classmethod
    def validate_log_format(cls, v: str) -> str:
        valid = {"text", "json"}
        lower = v.lower()
        if lower not in valid:
            raise ValueError(f"log_format must be one of {valid}")
        return lower

    @property
    def blocklist(self) -> list[str]:
        """Return blocked senders as a list, stripping whitespace."""
        if not self.blocklist_senders:
            return []
        return [s.strip().lower() for s in self.blocklist_senders.split(",") if s.strip()]


def load_settings() -> Settings:
    """Load and validate settings; raise on missing required vars."""
    return Settings()
