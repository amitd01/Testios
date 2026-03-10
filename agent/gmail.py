"""Gmail authentication, fetching, and sending with retry logic."""

from __future__ import annotations

import base64
import logging
import os
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import google.auth.exceptions
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .config import Settings
from .extractor import extract_article_links, extract_body
from .models import Newsletter

log = logging.getLogger(__name__)

# Gmail OAuth scope — read + send only
SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

# Newsletter sender domains / patterns for the Gmail search query
_NEWSLETTER_DOMAINS = [
    # Publishing platforms
    "substack.com",
    "substackmail.com",
    "beehiiv.com",
    "ghost.io",
    "mailchimp.com",
    "convertkit.com",
    "kit.com",
    "buttondown.email",
    # Distribution infrastructure
    "sendgrid.net",
    "sparkpostmail.com",
]

# Specific known newsletter senders (email addresses or domains)
_KNOWN_SENDERS = [
    "newsletter@farnamstreetblog.com",  # Farnam Street / fs.blog
    "list@ben-evans.com",               # Benedict Evans
    "crew@morningbrew.com",             # Morning Brew
    "a16z.com",                         # a16z (all addresses)
    "tldr.tech",                        # TLDR newsletter
    "lennyletter.com",                  # Lenny's Newsletter
]


def get_gmail_service(settings: Settings):
    """Authenticate with Gmail API, refreshing/creating token as needed."""
    creds: Credentials | None = None

    if os.path.exists(settings.gmail_token_file):
        try:
            creds = Credentials.from_authorized_user_file(settings.gmail_token_file, SCOPES)
        except Exception as exc:
            log.warning("Could not load token file: %s", exc)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                log.info("Gmail token refreshed successfully.")
            except google.auth.exceptions.RefreshError as exc:
                log.error(
                    "Gmail token refresh failed — re-run manually to re-authorise. Error: %s",
                    exc,
                )
                raise
        else:
            if not os.path.exists(settings.gmail_creds_file):
                raise FileNotFoundError(
                    f"OAuth credentials file not found: {settings.gmail_creds_file}. "
                    "Download it from Google Cloud Console."
                )
            flow = InstalledAppFlow.from_client_secrets_file(settings.gmail_creds_file, SCOPES)
            creds = flow.run_local_server(port=0)
            log.info("Gmail OAuth completed — token saved to %s", settings.gmail_token_file)

        with open(settings.gmail_token_file, "w") as fh:
            fh.write(creds.to_json())

    return build("gmail", "v1", credentials=creds)


def _build_query(settings: Settings, since: str) -> str:
    """Build the Gmail search query for newsletter detection."""
    all_senders = _NEWSLETTER_DOMAINS + _KNOWN_SENDERS + settings.newsletter_senders_list
    sender_terms = " OR ".join(f"from:{s}" for s in all_senders)
    query = (
        f"({sender_terms} OR label:newsletters) "
        f"after:{since} "
        f"-label:CATEGORY_PROMOTIONS "
        f"-subject:bounce -subject:\"delivery failure\""
    )
    return query


def _is_blocked(sender: str, blocklist: list[str]) -> bool:
    """Return True if the sender matches any entry in the blocklist."""
    sender_lower = sender.lower()
    return any(entry in sender_lower for entry in blocklist)


@retry(
    retry=retry_if_exception_type(HttpError),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(3),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)
def _list_messages(service, query: str, max_results: int) -> list[dict]:
    result = (
        service.users()
        .messages()
        .list(userId="me", q=query, maxResults=max_results)
        .execute()
    )
    return result.get("messages", [])


@retry(
    retry=retry_if_exception_type(HttpError),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(3),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)
def _get_message(service, msg_id: str) -> dict:
    return (
        service.users()
        .messages()
        .get(userId="me", id=msg_id, format="full")
        .execute()
    )


def fetch_newsletters(
    service,
    settings: Settings,
    already_processed: set[str],
) -> list[Newsletter]:
    """Return newsletter messages from the last N hours, skipping already-seen IDs."""
    since_dt = datetime.now() - timedelta(hours=settings.lookback_hours)
    since = since_dt.strftime("%Y/%m/%d")
    query = _build_query(settings, since)

    log.info("Gmail query: %s", query)
    messages = _list_messages(service, query, settings.max_newsletters)
    log.info("Found %d candidate message(s).", len(messages))

    blocklist = settings.blocklist
    newsletters: list[Newsletter] = []

    for msg in messages:
        msg_id = msg["id"]

        if msg_id in already_processed:
            log.debug("Skipping already-processed message %s", msg_id)
            continue

        try:
            data = _get_message(service, msg_id)
        except HttpError as exc:
            log.warning("Could not fetch message %s: %s — skipping.", msg_id, exc)
            continue

        try:
            headers = {h["name"]: h["value"] for h in data["payload"]["headers"]}
            sender = headers.get("From", "")

            if blocklist and _is_blocked(sender, blocklist):
                log.info("Blocked sender: %s — skipping.", sender)
                continue

            body = extract_body(data["payload"])
            links = extract_article_links(body)

            newsletters.append(
                Newsletter(
                    id=msg_id,
                    subject=headers.get("Subject", "(no subject)"),
                    sender=sender,
                    date=headers.get("Date", ""),
                    body=body,
                    links=links,
                )
            )
        except Exception as exc:
            log.warning(
                "Failed to parse message %s — skipping. Error: %s",
                msg_id,
                exc,
                exc_info=True,
            )
            continue

    log.info("Returning %d newsletters after filtering.", len(newsletters))
    return newsletters


@retry(
    retry=retry_if_exception_type(HttpError),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(3),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)
def send_digest(service, html: str, plain_text: str, settings: Settings) -> None:
    """Send the HTML+plain-text digest via Gmail API."""
    today = datetime.now().strftime("%B %d, %Y")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Amit's Top Reads — {today}"
    msg["From"] = settings.gmail_sender
    msg["To"] = settings.digest_recipient

    # Plain-text first (lower preference), HTML second (higher preference)
    msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html, "html"))

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
    log.info("Digest sent to %s", settings.digest_recipient)
