"""Playwright-based X/Twitter scraper for bookmarks and likes.

Outputs bookmarks.csv and likes.csv with columns:
  url, author, text, timestamp, embedded_links
"""

from __future__ import annotations

import asyncio
import csv
import json
import os
from datetime import datetime, timedelta, timezone

from playwright.async_api import async_playwright

STATE_FILE = os.environ.get("X_STATE_FILE", "state.json")


async def save_state(context):
    await context.storage_state(path=STATE_FILE)


async def get_tweets_from_page(
    page,
    scroll_attempts: int = 15,
    days_limit: int | None = None,
):
    """Scrape tweets from the current page.

    Args:
        page: Playwright page object.
        scroll_attempts: Number of scroll iterations.
        days_limit: If set, skip tweets whose creation date is older than
            this many days.  Use ``None`` for bookmarks — bookmarks are
            ordered by *bookmark* date, not tweet creation date, so
            filtering by tweet age would incorrectly drop most entries.
    """
    tweets_data: list[dict] = []
    seen_urls: set[str] = set()

    cutoff_date = None
    if days_limit is not None:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_limit)
        print(f"Filtering for tweets newer than {cutoff_date.strftime('%Y-%m-%d %H:%M:%S UTC')}")

    print(f"Scrolling through page ({scroll_attempts} attempts max)...")

    for i in range(scroll_attempts):
        try:
            print(f"  Scroll {i + 1}/{scroll_attempts} — {page.url}")
            await page.wait_for_selector(
                'article[data-testid="tweet"]', timeout=30000
            )

            tweets = await page.query_selector_all('article[data-testid="tweet"]')

            for tweet in tweets:
                try:
                    # Get tweet link / timestamp
                    time_element = await tweet.query_selector("a > time")
                    if time_element:
                        parent_a = await time_element.evaluate_handle(
                            "el => el.parentElement"
                        )
                        url = await parent_a.get_attribute("href")
                        url = f"https://x.com{url}"
                        timestamp = await time_element.get_attribute("datetime")
                    else:
                        url = ""
                        timestamp = ""

                    # Apply age filter only when days_limit is set
                    if cutoff_date and timestamp:
                        tweet_date = datetime.fromisoformat(
                            timestamp.replace("Z", "+00:00")
                        )
                        if tweet_date < cutoff_date:
                            continue

                    # Get tweet text
                    text_element = await tweet.query_selector(
                        'div[data-testid="tweetText"]'
                    )
                    text = await text_element.inner_text() if text_element else ""

                    # Get author info
                    user_element = await tweet.query_selector(
                        'div[data-testid="User-Name"]'
                    )
                    author = await user_element.inner_text() if user_element else ""

                    # Get external links — capture both t.co shortened links and
                    # pre-expanded URLs (X sometimes renders github.com, etc. directly).
                    # Exclude X-internal URLs (twitter.com, x.com profile/status links).
                    _x_internal = {"twitter.com", "x.com", "t.co"}
                    external_links = []
                    link_elements = await tweet.query_selector_all("a[href^='http']")
                    for element in link_elements:
                        link_href = await element.get_attribute("href")
                        if not link_href:
                            continue
                        # Keep t.co links (will resolve to real URLs) and any
                        # non-X domain that appears pre-expanded in the DOM.
                        from urllib.parse import urlparse
                        domain = urlparse(link_href).netloc.lstrip("www.")
                        is_x_internal = any(domain == d or domain.endswith("." + d) for d in _x_internal)
                        if not is_x_internal:
                            external_links.append(link_href)
                        elif "t.co" in link_href:
                            external_links.append(link_href)

                    external_links_str = ", ".join(list(set(external_links)))

                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        tweets_data.append(
                            {
                                "url": url,
                                "author": author.replace("\n", " "),
                                "text": text,
                                "timestamp": timestamp,
                                "embedded_links": external_links_str,
                            }
                        )
                except Exception:
                    pass  # Skip individual tweet parse errors

            # Scroll down to trigger lazy loading
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(3000)
        except Exception as e:
            print(f"No tweets found or timeout reached. Error: {e}")
            await page.screenshot(path="debug_timeout.png")
            break

    return tweets_data


async def main(
    headless: bool = False,
    scroll_attempts: int | None = None,
    bookmarks_out: str = "bookmarks.csv",
    likes_out: str = "likes.csv",
) -> None:
    """Run the X scraper, writing bookmarks.csv and likes.csv."""
    username = os.environ.get("X_USERNAME", "das_think")
    if scroll_attempts is None:
        scroll_attempts = int(os.environ.get("X_SCROLL_ATTEMPTS", "25"))

    async with async_playwright() as p:
        is_github = os.environ.get("GITHUB_ACTIONS") == "true"

        browser = await p.chromium.launch(
            headless=headless or is_github,
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )

        # Load session cookies from secret in CI
        if is_github and "X_STATE_JSON" in os.environ:
            with open(STATE_FILE, "w") as f:
                f.write(os.environ["X_STATE_JSON"])

        # Check for valid saved session
        needs_login = True
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, "r") as f:
                try:
                    state_data = json.load(f)
                    cookies_list = state_data.get("cookies", [])
                    if any(c.get("name") == "auth_token" for c in cookies_list):
                        needs_login = False
                        print("Loaded saved session.")
                    else:
                        print("Saved session invalid/expired. Starting fresh.")
                        os.remove(STATE_FILE)
                except Exception:
                    print("Could not read session file. Starting fresh.")
                    os.remove(STATE_FILE)

        if not needs_login:
            context = await browser.new_context(
                storage_state=STATE_FILE,
                viewport={"width": 1280, "height": 800},
            )
            page = await context.new_page()
        else:
            if is_github:
                print(
                    "Running in GitHub Actions but no valid state.json found. "
                    "Cannot manually sign in!"
                )
                await browser.close()
                raise RuntimeError(
                    "Missing or expired Twitter authentication in GitHub Actions."
                )

            print("No valid saved session found.")
            context = await browser.new_context(viewport={"width": 1280, "height": 800})
            page = await context.new_page()

            print("Opening X to log in...")
            await page.goto("https://x.com/login")
            print("\n*** ACTION REQUIRED ***")
            print("Please log in manually on the browser window.")
            print("Once logged in and on your home timeline, press Enter here.")
            input("Press Enter to continue...")

            await save_state(context)
            print("Session saved!")

        # ── Bookmarks ────────────────────────────────────────────────────
        print("\n=== Fetching Bookmarks ===")
        await page.goto("https://x.com/i/bookmarks")
        # No days_limit for bookmarks — they're ordered by bookmark date,
        # not tweet creation date.
        bookmarks = await get_tweets_from_page(
            page, scroll_attempts=scroll_attempts, days_limit=None
        )

        # ── Likes ────────────────────────────────────────────────────────
        likes = []
        if username:
            print(f"\n=== Fetching Likes for @{username} ===")
            await page.goto(f"https://x.com/{username}/likes")
            likes = await get_tweets_from_page(
                page, scroll_attempts=scroll_attempts, days_limit=14
            )
        else:
            print("\nSkipping Likes — X_USERNAME not set.")

        await save_state(context)
        await browser.close()

        # ── Write CSVs ───────────────────────────────────────────────────
        fieldnames = ["url", "author", "text", "timestamp", "embedded_links"]

        if bookmarks:
            with open(bookmarks_out, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(bookmarks)
            print(f"\nSaved {len(bookmarks)} bookmarks to {bookmarks_out}")

        if likes:
            with open(likes_out, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(likes)
            print(f"Saved {len(likes)} likes to {likes_out}")


if __name__ == "__main__":
    asyncio.run(main())
