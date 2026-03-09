"""Tests for agent.extractor — link extraction and body parsing."""

import base64


from agent.extractor import decode_base64_body, extract_article_links, extract_body


# ── decode_base64_body ────────────────────────────────────────────────────────


class TestDecodeBase64Body:
    def test_decodes_standard_base64url(self):
        original = "Hello, Newsletter!"
        encoded = base64.urlsafe_b64encode(original.encode()).decode().rstrip("=")
        assert decode_base64_body(encoded) == original

    def test_handles_padding_correctly(self):
        # Various lengths that need different amounts of padding
        for text in ["a", "ab", "abc", "abcd", "Hello, world!"]:
            encoded = base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")
            assert decode_base64_body(encoded) == text

    def test_ignores_invalid_utf8_bytes(self):
        # Raw bytes that aren't valid UTF-8 should not raise
        raw = b"\xff\xfe Hello"
        encoded = base64.urlsafe_b64encode(raw).decode().rstrip("=")
        result = decode_base64_body(encoded)
        assert isinstance(result, str)


# ── extract_body ──────────────────────────────────────────────────────────────


class TestExtractBody:
    def _encoded(self, text: str) -> str:
        return base64.urlsafe_b64encode(text.encode()).decode()

    def test_extracts_plain_text_part(self):
        payload = {
            "mimeType": "text/plain",
            "body": {"data": self._encoded("Plain text content")},
            "parts": [],
        }
        assert extract_body(payload) == "Plain text content"

    def test_prefers_plain_text_over_html(self):
        payload = {
            "mimeType": "multipart/alternative",
            "body": {},
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": self._encoded("Plain text")},
                    "parts": [],
                },
                {
                    "mimeType": "text/html",
                    "body": {"data": self._encoded("<b>HTML</b>")},
                    "parts": [],
                },
            ],
        }
        assert extract_body(payload) == "Plain text"

    def test_falls_back_to_html_when_no_plain_text(self):
        payload = {
            "mimeType": "text/html",
            "body": {"data": self._encoded("<b>HTML content</b>")},
            "parts": [],
        }
        assert extract_body(payload) == "<b>HTML content</b>"

    def test_returns_empty_string_when_no_body(self):
        payload = {"mimeType": "multipart/mixed", "body": {}, "parts": []}
        assert extract_body(payload) == ""

    def test_recurses_into_nested_parts(self):
        payload = {
            "mimeType": "multipart/mixed",
            "body": {},
            "parts": [
                {
                    "mimeType": "multipart/alternative",
                    "body": {},
                    "parts": [
                        {
                            "mimeType": "text/plain",
                            "body": {"data": self._encoded("Nested plain text")},
                            "parts": [],
                        }
                    ],
                }
            ],
        }
        assert extract_body(payload) == "Nested plain text"


# ── extract_article_links ─────────────────────────────────────────────────────


class TestExtractArticleLinks:
    def test_extracts_basic_urls(self):
        body = "Check this out: https://example.com/article and also https://blog.io/post"
        links = extract_article_links(body)
        assert "https://example.com/article" in links
        assert "https://blog.io/post" in links

    def test_skips_tracking_urls(self):
        body = (
            "Real article: https://example.com/article\n"
            "Tracking: https://track.example.com/open?id=123\n"
            "Unsubscribe: https://example.com/unsubscribe\n"
            "Pixel: https://pixel.example.com/beacon.png\n"
        )
        links = extract_article_links(body)
        assert "https://example.com/article" in links
        assert not any("unsubscribe" in u for u in links)
        assert not any("track" in u for u in links)
        assert not any("beacon" in u for u in links)

    def test_deduplicates_urls(self):
        body = (
            "https://example.com/article https://example.com/article "
            "https://example.com/article"
        )
        links = extract_article_links(body)
        assert links.count("https://example.com/article") == 1

    def test_caps_at_six_by_default(self):
        urls = [f"https://example.com/article-{i}" for i in range(10)]
        body = " ".join(urls)
        links = extract_article_links(body)
        assert len(links) <= 6

    def test_respects_custom_cap(self):
        urls = [f"https://example.com/article-{i}" for i in range(10)]
        body = " ".join(urls)
        links = extract_article_links(body, cap=3)
        assert len(links) <= 3

    def test_strips_trailing_punctuation(self):
        body = "See https://example.com/article, and https://other.com/post."
        links = extract_article_links(body)
        assert "https://example.com/article" in links
        assert "https://other.com/post" in links

    def test_prefers_substack_web_view_url(self):
        body = (
            "View this post on the web at https://substack-author.substack.com/p/my-post\n\n"
            "Also see https://substack.com/redirect/abc123?j=xxx"
        )
        links = extract_article_links(body)
        assert links[0] == "https://substack-author.substack.com/p/my-post"
        assert "substack.com/redirect" not in links

    def test_returns_empty_list_for_empty_body(self):
        assert extract_article_links("") == []

    def test_skips_image_urls(self):
        body = "Image: https://example.com/photo.png Article: https://example.com/read"
        links = extract_article_links(body)
        assert "https://example.com/photo.png" not in links
        assert "https://example.com/read" in links
