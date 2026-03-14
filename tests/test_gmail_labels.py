"""Tests for agent/gmail.py — label management (new functions).

Uses a mock Gmail service to avoid requiring live OAuth credentials.
"""

from __future__ import annotations

from unittest.mock import MagicMock, call

import pytest

from agent.gmail import ensure_newsletter_label, label_and_archive_messages


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_service(existing_labels: list[dict] | None = None) -> MagicMock:
    """Build a mock Gmail service.

    ``existing_labels`` is a list of dicts like ``{"id": "Label_1", "name": "Foo"}``.
    """
    service = MagicMock()
    labels_list = existing_labels or []

    # service.users().labels().list(userId="me").execute()
    service.users.return_value.labels.return_value.list.return_value.execute.return_value = {
        "labels": labels_list
    }
    # service.users().labels().create(userId="me", body=...).execute()
    service.users.return_value.labels.return_value.create.return_value.execute.return_value = {
        "id": "Label_NEW",
        "name": "Newsletter-Reviewed",
    }
    # service.users().messages().modify(userId="me", id=..., body=...).execute()
    service.users.return_value.messages.return_value.modify.return_value.execute.return_value = {}

    return service


# ── TestEnsureNewsletterLabel ─────────────────────────────────────────────────


class TestEnsureNewsletterLabel:
    def test_creates_label_when_missing(self):
        service = _make_service(existing_labels=[])
        label_id = ensure_newsletter_label(service, "Newsletter-Reviewed")
        assert label_id == "Label_NEW"
        service.users.return_value.labels.return_value.create.assert_called_once()

    def test_returns_existing_id_without_creating(self):
        service = _make_service(
            existing_labels=[{"id": "Label_EXISTING", "name": "Newsletter-Reviewed"}]
        )
        label_id = ensure_newsletter_label(service, "Newsletter-Reviewed")
        assert label_id == "Label_EXISTING"
        service.users.return_value.labels.return_value.create.assert_not_called()

    def test_case_insensitive_label_match(self):
        """Label lookup is case-insensitive."""
        service = _make_service(
            existing_labels=[{"id": "Label_CASE", "name": "newsletter-reviewed"}]
        )
        label_id = ensure_newsletter_label(service, "Newsletter-Reviewed")
        assert label_id == "Label_CASE"

    def test_does_not_create_when_label_exists(self):
        service = _make_service(
            existing_labels=[
                {"id": "Label_OTHER", "name": "Other Label"},
                {"id": "Label_TARGET", "name": "Newsletter-Reviewed"},
            ]
        )
        ensure_newsletter_label(service, "Newsletter-Reviewed")
        service.users.return_value.labels.return_value.create.assert_not_called()

    def test_creates_with_custom_label_name(self):
        service = _make_service(existing_labels=[])
        # Override the create mock to return the right name
        service.users.return_value.labels.return_value.create.return_value.execute.return_value = {
            "id": "Label_CUSTOM",
            "name": "My Custom Label",
        }
        label_id = ensure_newsletter_label(service, "My Custom Label")
        assert label_id == "Label_CUSTOM"


# ── TestLabelAndArchiveMessages ───────────────────────────────────────────────


class TestLabelAndArchiveMessages:
    def test_calls_modify_once_per_message(self):
        service = _make_service()
        msg_ids = ["msg1", "msg2", "msg3"]
        label_and_archive_messages(service, msg_ids, "Label_123")
        modify = service.users.return_value.messages.return_value.modify
        assert modify.call_count == 3

    def test_modify_body_correct_structure(self):
        service = _make_service()
        label_and_archive_messages(service, ["msg1"], "Label_TARGET")
        modify = service.users.return_value.messages.return_value.modify
        call_kwargs = modify.call_args
        body = call_kwargs.kwargs.get("body") or call_kwargs[1].get("body")
        assert "Label_TARGET" in body["addLabelIds"]
        assert "INBOX" in body["removeLabelIds"]

    def test_empty_msg_ids_no_api_calls(self):
        service = _make_service()
        label_and_archive_messages(service, [], "Label_123")
        service.users.return_value.messages.return_value.modify.assert_not_called()

    def test_all_msg_ids_processed(self):
        service = _make_service()
        msg_ids = [f"msg{i}" for i in range(10)]
        label_and_archive_messages(service, msg_ids, "Label_X")
        assert service.users.return_value.messages.return_value.modify.call_count == 10

    def test_modify_called_with_correct_user_id(self):
        service = _make_service()
        label_and_archive_messages(service, ["msgABC"], "Label_Y")
        modify = service.users.return_value.messages.return_value.modify
        call_kwargs = modify.call_args
        user_id = call_kwargs.kwargs.get("userId") or call_kwargs[1].get("userId")
        assert user_id == "me"
