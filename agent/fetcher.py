"""Article fetcher — download and parse article text from URLs.

Used for two purposes:
1. Expand compilation newsletters (Ben-Evans, TLDR, Morning Brew) so Claude
   sees the actual article content instead of link-aggregator summaries.
2. Pre-populate whitelist Newsletter objects with article body text.

All network calls are best-effort: any failure returns ("", "") so the
pipeline continues without crashing.
"""

from __future__ import annotations

import html as html_module
import logging
import re
import urllib.request
from html.parser import HTMLParser
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import Newsletter

log = logging.getLogger(__name__)

# Max bytes to read per URL (prevents huge pages from blocking the pipeline)
READ_CAP_BYTES = 32 * 1024  # 32 KB

# Request timeout in seconds
FETCH_TIMEOUT = 8

# Max articles to expand per compilation newsletter (legacy)
MAX_ARTICLES_PER_COMPILATION = 8

# Max links to fetch per email in the two-pass expansion (new architecture)
MAX_ARTICLES_PER_EXPANSION = 10

# Min chars for an email body to qualify as a standalone article (Pass 1)
_EMAIL_BODY_MIN_CHARS = 800

# Max links an email may have for its body to still count as a direct article
# (emails with 3+ links are likely aggregator digests — skip Pass 1 for them)
_EMAIL_BODY_MAX_LINKS_FOR_PASS1 = 2

# Max body chars forwarded to the scorer for each candidate
MAX_BODY_CHARS_CANDIDATE = 3000

# Domains that render via JS or are paywalled/social — skip fetching
_SKIP_DOMAINS = frozenset(
    [
        "twitter.com",
        "x.com",
        "youtube.com",
        "youtu.be",
        "instagram.com",
        "tiktok.com",
        "facebook.com",
        "reddit.com",
        "linkedin.com",
        "wsj.com",
        "ft.com",
        "bloomberg.com",
        "nytimes.com",
        "economist.com",
        "hbr.org",
    ]
)

_USER_AGENT = (
    "Mozilla/5.0 (compatible; NewsletterAgentBot/1.0; +https://github.com)"
)


class _TextExtractor(HTMLParser):
    """Minimal HTML → text extractor, strips scripts/styles."""

    def __init__(self) -> None:
        super().__init__()
        self._skip = False
        self._chunks: list[str] = []
        self._title: str = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ("script", "style", "noscript", "nav", "footer", "header"):
            self._skip = True
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript", "nav", "footer", "header"):
            self._skip = False
        if tag == "title":
            self._in_title = False
        if tag in ("p", "h1", "h2", "h3", "h4", "li", "br", "div"):
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        if self._in_title:
            self._title += data
        else:
            self._chunks.append(data)

    @property
    def text(self) -> str:
        raw = "".join(self._chunks)
        # Collapse whitespace runs
        collapsed = re.sub(r"[ \t]+", " ", raw)
        collapsed = re.sub(r"\n{3,}", "\n\n", collapsed)
        return html_module.unescape(collapsed).strip()

    @property
    def title(self) -> str:
        return html_module.unescape(self._title.strip())


def _should_skip(url: str) -> bool:
    """Return True for domains we can't or shouldn't fetch."""
    from urllib.parse import urlparse

    try:
        host = urlparse(url).netloc.lower().lstrip("www.")
    except Exception:
        return True
    return any(host == d or host.endswith("." + d) for d in _SKIP_DOMAINS)


def _ssl_context():
    """Return an SSL context that trusts system certs (certifi if available)."""
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def resolve_url(url: str, timeout: int = 5) -> str:
    """Follow HTTP redirects and return the final URL (e.g. t.co → real URL).

    Used to resolve Twitter/X shortlinks before dedup and before passing to Claude.
    Returns the original URL on any failure.
    """
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
            return resp.url  # final URL after all redirects
    except Exception:
        return url


def fetch_article(url: str) -> tuple[str, str]:
    """Download and parse an article URL.

    Args:
        url: Article URL to fetch.

    Returns:
        (title, body_text) — both empty strings on any failure.
    """
    if _should_skip(url):
        log.debug("fetch_article: skipping domain for %s", url)
        return "", ""

    try:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT, context=_ssl_context()) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "html" not in content_type.lower():
                log.debug("fetch_article: non-HTML content-type for %s", url)
                return "", ""
            raw_bytes = resp.read(READ_CAP_BYTES)
    except Exception as exc:
        log.debug("fetch_article: failed to fetch %s: %s", url, exc)
        return "", ""

    try:
        charset_match = re.search(r"charset=['\"]?([\w-]+)", content_type, re.I)
        charset = charset_match.group(1) if charset_match else "utf-8"
        html_text = raw_bytes.decode(charset, errors="replace")
    except Exception:
        html_text = raw_bytes.decode("utf-8", errors="replace")

    parser = _TextExtractor()
    try:
        parser.feed(html_text)
    except Exception as exc:
        log.debug("fetch_article: HTML parse error for %s: %s", url, exc)
        return "", ""

    title = parser.title
    body = parser.text

    if not body:
        log.debug("fetch_article: empty body extracted from %s", url)
        return title, ""

    log.debug("fetch_article: fetched %d chars from %s", len(body), url)
    return title, body


def extract_email_candidates(
    newsletter: "Newsletter",
) -> list:
    """Convert an email newsletter into a list of ArticleCandidate objects.

    Two passes run on **every** email (no compilation gate):

    Pass 1 — Body as article
        If the email body is longer than ``_EMAIL_BODY_MIN_CHARS`` characters
        **and** the email has at most ``_EMAIL_BODY_MAX_LINKS_FOR_PASS1`` links,
        the body itself is treated as a direct long-form article candidate.
        This catches standalone Substack essays, a16z long reads, etc.

    Pass 2 — Links in body
        Each link extracted from the email body is fetched via
        ``fetch_article()``.  Up to ``MAX_ARTICLES_PER_EXPANSION`` successfully
        fetched links become individual candidates.

    A single email can produce 0–1 body candidate (Pass 1) plus 0–10 link
    candidates (Pass 2), for a maximum of 11 ArticleCandidate objects.

    Args:
        newsletter: A Newsletter email object.

    Returns:
        List of ``ArticleCandidate`` objects (possibly empty).
    """
    from .models import ArticleCandidate

    candidates: list[ArticleCandidate] = []
    seen_urls: set[str] = set()
    body = newsletter.body
    links = newsletter.links  # pre-extracted by extract_article_links()

    # ── Pass 1: Body as article ───────────────────────────────────────────────
    pass1_added = False
    if len(body) > _EMAIL_BODY_MIN_CHARS and len(links) <= _EMAIL_BODY_MAX_LINKS_FOR_PASS1:
        # Canonical URL: use the sole link if exactly one, else a synthetic ID
        url = links[0] if len(links) == 1 else f"email:{newsletter.id}"
        seen_urls.add(url)
        candidates.append(
            ArticleCandidate(
                url=url,
                title=newsletter.subject,
                body=body[:MAX_BODY_CHARS_CANDIDATE],
                source=newsletter.sender,
                source_type="email",
                date=newsletter.date,
                origin_id=newsletter.id,
            )
        )
        pass1_added = True
        log.debug(
            "extract_email_candidates: Pass 1 body candidate from '%s' (%d chars body).",
            newsletter.subject[:60],
            len(body),
        )

    # ── Pass 2: Fetch each link ───────────────────────────────────────────────
    pass2_count = 0
    for url in links:
        if pass2_count >= MAX_ARTICLES_PER_EXPANSION:
            break
        if url in seen_urls:
            continue
        if _should_skip(url):
            log.debug("extract_email_candidates: skipping domain for %s", url)
            continue

        title, body_text = fetch_article(url)
        if not body_text:
            log.debug("extract_email_candidates: no body fetched for %s", url)
            continue

        seen_urls.add(url)
        candidates.append(
            ArticleCandidate(
                url=url,
                title=title or newsletter.subject,
                body=body_text[:MAX_BODY_CHARS_CANDIDATE],
                source=newsletter.sender,
                source_type="email",
                date=newsletter.date,
                origin_id=newsletter.id,
            )
        )
        pass2_count += 1
        log.debug(
            "extract_email_candidates: Pass 2 fetched %s (%d chars).",
            url,
            len(body_text),
        )

    log.info(
        "extract_email_candidates: '%s' → %d candidate(s) "
        "(Pass 1: %s, Pass 2: %d link(s) fetched).",
        newsletter.subject[:60],
        len(candidates),
        "yes" if pass1_added else "no",
        pass2_count,
    )
    return candidates


def expand_compilation(
    newsletter: "Newsletter",
    used_urls: set[str],
) -> list["Newsletter"]:
    """Replace a compilation newsletter with one Newsletter per fetched article.

    If all fetches fail, returns the original newsletter unchanged so Claude
    still has something to work with.

    Args:
        newsletter: A compilation newsletter (e.g. Ben-Evans, TLDR).
        used_urls: Already-used URLs (for dedup).

    Returns:
        List of Newsletter objects, one per successfully fetched article.
        Falls back to [newsletter] if nothing could be fetched.
    """
    from .models import Newsletter as NL

    links = [l for l in newsletter.links if l not in used_urls]
    links = links[:MAX_ARTICLES_PER_COMPILATION]

    if not links:
        log.debug("expand_compilation: no new links in %s", newsletter.subject)
        return [newsletter]

    expanded: list[NL] = []
    for url in links:
        title, body = fetch_article(url)
        if not body:
            log.debug("expand_compilation: no body for %s — skipping.", url)
            continue
        expanded.append(
            NL(
                id=f"{newsletter.id}::{url}",
                subject=title or newsletter.subject,
                sender=newsletter.sender,
                date=newsletter.date,
                body=body,
                links=[url],
            )
        )

    if not expanded:
        log.info(
            "expand_compilation: all fetches failed for '%s' — using original.",
            newsletter.subject,
        )
        return [newsletter]

    log.info(
        "expand_compilation: '%s' → %d article(s) fetched.",
        newsletter.subject,
        len(expanded),
    )
    return expanded
