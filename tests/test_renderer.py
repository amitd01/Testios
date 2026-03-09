"""Tests for agent.renderer — HTML and plain-text digest builder."""


from agent.models import Article, ScoreBreakdown
from agent.renderer import build_html, build_plain_text


def _make_article(rank: int = 1, title: str = "Test Article") -> Article:
    return Article(
        rank=rank,
        title=title,
        url=f"https://example.com/article-{rank}",
        source="Test Newsletter",
        date="March 9, 2026",
        summary="This is a test summary with enough words to pass the length check.",
        tags=["tech", "ai"],
        score=8.5,
        scores=ScoreBreakdown(
            originality=9.0,
            real_world_impact=8.0,
            writing_quality=8.0,
            interestingness=9.0,
        ),
    )


SENDER = "sender@gmail.com"


# ── build_html ────────────────────────────────────────────────────────────────


class TestBuildHtml:
    def test_contains_article_title(self):
        article = _make_article(title="My Great Article")
        html = build_html([article], SENDER)
        assert "My Great Article" in html

    def test_contains_article_url(self):
        article = _make_article()
        html = build_html([article], SENDER)
        assert article.url in html

    def test_contains_rank_badge(self):
        article = _make_article(rank=1)
        html = build_html([article], SENDER)
        assert "rank-badge" in html
        assert "# 1  BEST READ" in html

    def test_rank_badge_for_non_first(self):
        article = _make_article(rank=3)
        html = build_html([article], SENDER)
        assert "# 3" in html

    def test_contains_score_pills(self):
        article = _make_article()
        html = build_html([article], SENDER)
        assert "score-pill" in html
        assert "score-o" in html  # originality
        assert "score-i" in html  # impact
        assert "score-w" in html  # writing quality
        assert "score-x" in html  # interestingness
        assert "score-avg" in html

    def test_no_nav_for_fewer_than_five_articles(self):
        articles = [_make_article(rank=i, title=f"Article {i}") for i in range(1, 4)]
        html = build_html(articles, SENDER)
        assert 'class="nav"' not in html

    def test_nav_present_for_five_or_more_articles(self):
        articles = [_make_article(rank=i, title=f"Article {i}") for i in range(1, 6)]
        html = build_html(articles, SENDER)
        assert 'class="nav"' in html
        assert "Jump to" in html

    def test_nav_anchor_links_match_article_ids(self):
        articles = [_make_article(rank=i, title=f"Article {i}") for i in range(1, 6)]
        html = build_html(articles, SENDER)
        for i in range(1, 6):
            assert f'id="article-{i}"' in html
            assert f'href="#article-{i}"' in html

    def test_dark_mode_media_query_present(self):
        html = build_html([_make_article()], SENDER)
        assert "prefers-color-scheme: dark" in html

    def test_contains_doctype(self):
        html = build_html([_make_article()], SENDER)
        assert "<!DOCTYPE html>" in html.upper() or "<!doctype html>" in html.lower()

    def test_multiple_articles_all_present(self):
        articles = [_make_article(rank=i, title=f"Article {i}") for i in range(1, 4)]
        html = build_html(articles, SENDER)
        for i in range(1, 4):
            assert f"Article {i}" in html

    def test_tags_rendered(self):
        article = _make_article()
        html = build_html([article], SENDER)
        assert "tech" in html
        assert "ai" in html

    def test_source_and_date_rendered(self):
        article = _make_article()
        html = build_html([article], SENDER)
        assert "Test Newsletter" in html
        assert "March 9, 2026" in html

    def test_sender_in_footer(self):
        html = build_html([_make_article()], SENDER)
        assert SENDER in html


# ── build_plain_text ──────────────────────────────────────────────────────────


class TestBuildPlainText:
    def test_contains_title(self):
        article = _make_article(title="Plain Text Article")
        text = build_plain_text([article])
        assert "Plain Text Article" in text

    def test_contains_url(self):
        article = _make_article()
        text = build_plain_text([article])
        assert article.url in text

    def test_contains_rank(self):
        article = _make_article(rank=2)
        text = build_plain_text([article])
        assert "#2" in text

    def test_contains_score(self):
        article = _make_article()
        text = build_plain_text([article])
        assert "8.5" in text

    def test_contains_summary(self):
        article = _make_article()
        text = build_plain_text([article])
        assert article.summary in text

    def test_multiple_articles_all_present(self):
        articles = [_make_article(rank=i, title=f"Article {i}") for i in range(1, 4)]
        text = build_plain_text(articles)
        for i in range(1, 4):
            assert f"Article {i}" in text

    def test_non_empty_string(self):
        assert build_plain_text([_make_article()]).strip() != ""

    def test_empty_articles(self):
        text = build_plain_text([])
        assert isinstance(text, str)
