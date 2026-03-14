"""Data models for Newsletter Digest Agent."""

from dataclasses import dataclass, field


@dataclass
class Newsletter:
    """Represents a fetched newsletter email."""

    id: str
    subject: str
    sender: str
    date: str
    body: str
    links: list[str] = field(default_factory=list)


@dataclass
class ScoreBreakdown:
    """Four-dimension scoring rubric used by Claude."""

    originality: float = 0.0
    real_world_impact: float = 0.0
    writing_quality: float = 0.0
    interestingness: float = 0.0

    @property
    def average(self) -> float:
        return (
            self.originality
            + self.real_world_impact
            + self.writing_quality
            + self.interestingness
        ) / 4


@dataclass
class Article:
    """A ranked article extracted from a newsletter or X tweet."""

    rank: int
    title: str
    url: str
    source: str
    date: str
    summary: str
    source_type: str = "email"  # "email" or "x"
    tags: list[str] = field(default_factory=list)
    score: float = 0.0
    scores: ScoreBreakdown = field(default_factory=ScoreBreakdown)


@dataclass
class ExcludedItem:
    """An email/article excluded by Claude with a reason."""

    subject: str
    reason: str


@dataclass
class ArticleCandidate:
    """Intermediate representation of an article candidate for scoring.

    Produced by Step 2 (EXPAND) from email newsletters and X tweets.
    Consumed by Step 3 (SCORE) and Step 4 (SELECT).

    Fields
    ------
    url         Canonical article URL (t.co resolved).
    title       Page title (from fetched page or email subject).
    body        Fetched article text or tweet body (Type C).
    source      Human-readable author / newsletter name.
    source_type "email" | "x" | "whitelist"
    date        Publication date (tweet timestamp or email Date header).
    origin_id   Stable back-reference to the source:
                  - Gmail message ID for email candidates
                  - Tweet URL for X candidates
                  - Whitelist URL for whitelist candidates
                Used in Step 5 to track processed sources.
    """

    url: str
    title: str
    body: str
    source: str
    source_type: str  # "email" | "x" | "whitelist"
    date: str
    origin_id: str
