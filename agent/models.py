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
    """A ranked article extracted from a newsletter."""

    rank: int
    title: str
    url: str
    source: str
    date: str
    summary: str
    tags: list[str] = field(default_factory=list)
    score: float = 0.0
    scores: ScoreBreakdown = field(default_factory=ScoreBreakdown)


@dataclass
class ExcludedItem:
    """An email/article excluded by Claude with a reason."""

    subject: str
    reason: str
