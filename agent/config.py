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

    # ── Content ────────────────────────────────────────────────────────────────
    summary_max_words: int = Field(
        250,
        description="Target max words per article summary (e.g. 150, 250, 350)",
    )

    # ── X/Twitter Scraper ───────────────────────────────────────────────────────
    x_bookmarks_csv: str = Field("bookmarks.csv", description="Path to X bookmarks CSV")
    x_likes_csv: str = Field("likes.csv", description="Path to X likes CSV")
    x_username: str = Field("", description="X/Twitter username for likes scraping")
    x_scroll_attempts: int = Field(25, description="Scroll iterations for X scraping")

    # ── Compilation newsletters ────────────────────────────────────────────────
    compilation_senders: str = Field(
        "",
        description="Comma-separated sender addresses whose emails should be expanded "
        "(fetch each embedded article separately), e.g. 'list@ben-evans.com,digest@tldr.tech'",
    )

    # ── Article history ────────────────────────────────────────────────────────
    article_history_file: str = Field(
        "article_history.json",
        description="Path to JSON file that stores per-run article history (30-day rolling)",
    )

    # ── Whitelisting ────────────────────────────────────────────────────────────
    whitelist_file: str = Field(
        "whitelist.txt",
        description="Path to plain-text file with one manually curated URL per line",
    )
    whitelist_label: str = Field(
        "newsletter-whitelist",
        description="Gmail label whose emails' links are treated as whitelisted articles",
    )

    # ── Ranking / output ────────────────────────────────────────────────────────
    max_articles: int = Field(
        8,
        description="Maximum number of articles to include in each digest",
    )
    min_score_threshold: float = Field(
        6.5,
        description="Minimum average score (0–10) an article must reach to be included",
    )
    compilation_min_links: int = Field(
        2,
        description="Emails with this many article links or more are expanded per-link",
    )

    # ── Filtering ──────────────────────────────────────────────────────────────
    blocklist_senders: str = Field(
        "",
        description="Comma-separated list of sender addresses/domains to block",
    )
    newsletter_senders: str = Field(
        "",
        description="Comma-separated extra sender emails/domains to include in the Gmail query",
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
    def newsletter_senders_list(self) -> list[str]:
        """Return extra newsletter senders as a list, stripping whitespace."""
        if not self.newsletter_senders:
            return []
        return [s.strip() for s in self.newsletter_senders.split(",") if s.strip()]

    @property
    def blocklist(self) -> list[str]:
        """Return blocked senders as a list, stripping whitespace."""
        if not self.blocklist_senders:
            return []
        return [s.strip().lower() for s in self.blocklist_senders.split(",") if s.strip()]


def load_settings() -> Settings:
    """Load and validate settings; raise on missing required vars.

    If the shell has an empty ANTHROPIC_API_KEY (e.g. exported by Claude Desktop
    as ``ANTHROPIC_API_KEY=``), pydantic-settings would use that empty string
    instead of the key in .env.  We temporarily remove the empty var so .env wins.
    """
    import os

    _sentinel = object()
    raw = os.environ.get("ANTHROPIC_API_KEY", _sentinel)
    _removed = raw is not _sentinel and not str(raw).strip()
    if _removed:
        del os.environ["ANTHROPIC_API_KEY"]
    try:
        return Settings()
    finally:
        if _removed:
            os.environ["ANTHROPIC_API_KEY"] = ""  # restore so we don't mutate caller env
