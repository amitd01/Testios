"""Link extraction and email body parsing."""

from __future__ import annotations

import base64
import logging
import re

log = logging.getLogger(__name__)

# Patterns indicating tracking/utility links — not article links
_SKIP_PATTERNS = re.compile(
    r"unsubscribe|track|redirect|pixel|beacon|open\?|click\?|"
    r"\.png|\.jpg|\.gif|\.svg|mailto:|action/disable|"
    r"substack\.com/redirect|list-manage\.com|r\.substack\.com",
    re.IGNORECASE,
)

# Substack canonical web-view URL pattern (appears near the top of Substack emails)
_SUBSTACK_WEB_VIEW = re.compile(
    r"View this (?:post|email) (?:on the web|in your browser)(?: at)?\s+(https://[^\s>]+)",
    re.IGNORECASE,
)


def decode_base64_body(data: str) -> str:
    """Base64url-decode a Gmail message part payload string."""
    # Pad to multiple of 4
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="ignore")


def extract_body(payload: dict) -> str:
    """Recursively pull plain-text body from a Gmail payload tree."""
    mime = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")

    if body_data and mime == "text/plain":
        return decode_base64_body(body_data)

    for part in payload.get("parts", []):
        result = extract_body(part)
        if result:
            return result

    # Fallback: accept HTML if no plain text found
    if body_data and mime == "text/html":
        return decode_base64_body(body_data)

    return ""


def _prefer_substack_web_view(body: str) -> str | None:
    """Return the canonical Substack web-view URL if present."""
    m = _SUBSTACK_WEB_VIEW.search(body)
    if m:
        url = m.group(1).rstrip(".,;")
        log.debug("Found Substack web-view URL: %s", url)
        return url
    return None


def extract_article_links(body: str, cap: int = 6) -> list[str]:
    """Pull candidate article URLs from email body, deduped and filtered.

    Prefers the Substack canonical URL when present. Falls back to scanning
    all URLs in the body, skipping tracking links and deduplicating.
    """
    # 1. Check for Substack canonical link first
    canonical = _prefer_substack_web_view(body)

    raw = re.findall(r"https?://[^\s\)>\]\"'<]+", body)
    seen: set[str] = set()
    links: list[str] = []

    if canonical:
        seen.add(canonical)
        links.append(canonical)

    for url in raw:
        url = url.rstrip(".,;")
        if url not in seen and not _SKIP_PATTERNS.search(url):
            seen.add(url)
            links.append(url)
        if len(links) >= cap:
            break

    return links
