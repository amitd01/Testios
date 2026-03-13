"""Article whitelisting — inject manually curated URLs into the candidate pool.

Three sources (resolved in order, all deduplicated against used_urls):
1. whitelist.txt file — one URL per line, # comments supported
2. Gmail label 'newsletter-whitelist' (optional, requires Gmail service)
3. Web UI POST /whitelist (appends to whitelist.txt; handled in daily_brief_app)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from .models import Newsletter

if TYPE_CHECKING:
    pass

log = logging.getLogger(__name__)


def load_whitelist_file(path: str) -> list[str]:
    """Read URLs from a whitelist file, one per line. Ignores blank lines and # comments."""
    import os

    if not os.path.exists(path):
        return []

    urls: list[str] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            # Strip inline comments (e.g. "https://... # added via web UI")
            url = stripped.split("#")[0].strip()
            if url:
                urls.append(url)

    log.info("Whitelist file: loaded %d URL(s) from %s.", len(urls), path)
    return urls


def fetch_gmail_whitelist_urls(service, label_name: str) -> list[str]:
    """Read emails from a Gmail label and extract article links from them.

    Args:
        service: Authenticated Gmail API service object.
        label_name: Gmail label to query (e.g. 'newsletter-whitelist').

    Returns:
        Deduplicated list of URLs found in matching emails.
    """
    from .gmail import extract_article_links

    try:
        # Find label ID by name
        labels_resp = service.users().labels().list(userId="me").execute()
        label_id: str | None = None
        for lbl in labels_resp.get("labels", []):
            if lbl.get("name", "").lower() == label_name.lower():
                label_id = lbl["id"]
                break

        if not label_id:
            log.debug("Gmail label '%s' not found — skipping.", label_name)
            return []

        # Fetch messages with this label
        msgs_resp = (
            service.users()
            .messages()
            .list(userId="me", labelIds=[label_id], maxResults=50)
            .execute()
        )
        messages = msgs_resp.get("messages", [])
        if not messages:
            log.debug("No messages in label '%s'.", label_name)
            return []

        urls: list[str] = []
        for msg_meta in messages:
            msg = (
                service.users()
                .messages()
                .get(userId="me", id=msg_meta["id"], format="full")
                .execute()
            )
            body = _extract_body(msg)
            found = extract_article_links(body)
            urls.extend(found)

        unique = list(dict.fromkeys(urls))  # preserve order, dedupe
        log.info(
            "Gmail whitelist label '%s': found %d URL(s) across %d email(s).",
            label_name,
            len(unique),
            len(messages),
        )
        return unique

    except Exception as exc:
        log.warning("Failed to fetch Gmail whitelist label '%s': %s", label_name, exc)
        return []


def _extract_body(msg: dict) -> str:
    """Extract plain-text body from a Gmail message payload."""
    import base64

    payload = msg.get("payload", {})
    parts = payload.get("parts", [])

    if not parts:
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
        return ""

    for part in parts:
        if part.get("mimeType") == "text/plain":
            data = part.get("body", {}).get("data", "")
            if data:
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")

    return ""


def build_whitelist_newsletters(
    urls: list[str],
    used_urls: set[str],
    fetch_fn=None,
) -> list[Newsletter]:
    """Wrap whitelist URLs into Newsletter objects for the ranking pipeline.

    Args:
        urls: List of URLs to include.
        used_urls: Already-used URLs to skip (dedup).
        fetch_fn: Optional callable(url) -> (title, body) from fetcher.py.
                  If None, Newsletter body will be empty (Claude uses URL only).

    Returns:
        List of Newsletter objects with id='whitelist::<url>'.
    """
    newsletters: list[Newsletter] = []
    skipped = 0

    for url in urls:
        if url in used_urls:
            skipped += 1
            continue

        title = ""
        body = ""
        if fetch_fn is not None:
            try:
                title, body = fetch_fn(url)
            except Exception as exc:
                log.debug("fetch_fn failed for whitelist URL %s: %s", url, exc)

        newsletters.append(
            Newsletter(
                id=f"whitelist::{url}",
                subject=title or f"[Whitelist] {url}",
                sender="Whitelist",
                date="",
                body=body,
                links=[url],
            )
        )

    if skipped:
        log.debug("Whitelist: skipped %d already-used URL(s).", skipped)
    log.info("Whitelist: %d new article(s) added to candidate pool.", len(newsletters))
    return newsletters
