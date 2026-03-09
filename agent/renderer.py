"""HTML and plain-text email digest builder."""

from __future__ import annotations

from datetime import datetime

from .models import Article

_CSS = """
/* ── Reset & base ─────────────────────────────── */
body{font-family:Georgia,'Times New Roman',serif;background:#f9f7f4;color:#222;margin:0;padding:0}
.container{max-width:680px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}

/* ── Header ───────────────────────────────────── */
.header{background:#1a1a2e;color:#fff;padding:28px 36px 20px}
.header h1{margin:0 0 4px;font-size:22px;letter-spacing:.5px}
.header p{margin:0;font-size:13px;color:#aab;font-family:Arial,sans-serif}

/* ── Nav (anchor list) ────────────────────────── */
.nav{padding:14px 36px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;color:#555}
.nav ol{margin:6px 0 0;padding-left:20px}
.nav li{margin-bottom:3px}
.nav a{color:#1a1a2e;text-decoration:none}
.nav a:hover{text-decoration:underline}

/* ── Intro ────────────────────────────────────── */
.intro{padding:16px 36px;font-size:14px;color:#555;font-family:Arial,sans-serif;border-bottom:1px solid #eee}

/* ── Articles ─────────────────────────────────── */
.article{padding:24px 36px;border-bottom:1px solid #f0ede8}
.rank-badge{display:inline-block;background:#1a1a2e;color:#fff;font-size:11px;font-weight:700;border-radius:3px;padding:2px 8px;margin-bottom:8px;font-family:Arial,sans-serif;letter-spacing:1px}
.article h2{margin:4px 0 2px;font-size:17px;line-height:1.3}
.article h2 a{color:#1a1a2e;text-decoration:none}
.meta{font-size:12px;color:#888;margin:0 0 10px;font-family:Arial,sans-serif}
.summary{font-size:14.5px;line-height:1.75;color:#333;margin:0}
.tag{display:inline-block;background:#f0ede8;color:#666;font-size:11px;border-radius:3px;padding:2px 7px;margin:8px 4px 0 0;font-family:Arial,sans-serif}

/* ── Score pills ──────────────────────────────── */
.scores{margin-top:10px;font-family:Arial,sans-serif}
.score-pill{display:inline-block;border-radius:20px;font-size:10px;font-weight:700;padding:2px 8px;margin:0 3px 0 0;color:#fff}
.score-o{background:#5b7fa6}   /* originality      — blue   */
.score-i{background:#6a9e6b}   /* impact           — green  */
.score-w{background:#9e7a6a}   /* writing quality  — brown  */
.score-x{background:#a07ab5}   /* interestingness  — purple */
.score-avg{display:inline-block;background:#555;color:#fff;border-radius:20px;font-size:10px;font-weight:700;padding:2px 8px;margin-left:6px;font-family:Arial,sans-serif}

/* ── Footer ───────────────────────────────────── */
.footer{background:#f0ede8;padding:16px 36px;font-size:12px;color:#999;font-family:Arial,sans-serif;text-align:center}

/* ── Dark-mode overrides ──────────────────────── */
@media (prefers-color-scheme: dark) {
  body{background:#1c1c1e;color:#f0f0f0}
  .container{background:#2c2c2e;box-shadow:0 2px 12px rgba(0,0,0,.4)}
  .header{background:#0d0d1a}
  .header p{color:#8899aa}
  .nav{color:#aaa;border-bottom-color:#3a3a3c}
  .nav a{color:#a0c4ff}
  .intro{color:#aaa;border-bottom-color:#3a3a3c}
  .article{border-bottom-color:#3a3a3c}
  .rank-badge{background:#0d0d1a}
  .article h2 a{color:#a0c4ff}
  .meta{color:#888}
  .summary{color:#ccc}
  .tag{background:#3a3a3c;color:#aaa}
  .footer{background:#2a2a2c;color:#666}
}
"""


def _score_pills(article: Article) -> str:
    s = article.scores
    avg = article.score or s.average
    return (
        f'<div class="scores">'
        f'<span class="score-pill score-o">O {s.originality:.0f}</span>'
        f'<span class="score-pill score-i">I {s.real_world_impact:.0f}</span>'
        f'<span class="score-pill score-w">W {s.writing_quality:.0f}</span>'
        f'<span class="score-pill score-x">X {s.interestingness:.0f}</span>'
        f'<span class="score-avg">avg {avg:.1f}</span>'
        f"</div>"
    )


def _anchor_nav(articles: list[Article]) -> str:
    items = "".join(
        f'<li><a href="#article-{a.rank}">{a.rank}. {a.title}</a></li>'
        for a in articles
    )
    return f'<div class="nav"><strong>Jump to</strong><ol>{items}</ol></div>'


def build_html(articles: list[Article], sender: str) -> str:
    """Render ranked articles as a clean, dark-mode-safe HTML email."""
    today = datetime.now().strftime("%B %d, %Y")

    nav = _anchor_nav(articles) if len(articles) >= 5 else ""

    rows = ""
    for a in articles:
        label = "# 1  BEST READ" if a.rank == 1 else f"# {a.rank}"
        tags_html = "".join(f'<span class="tag">{t}</span>' for t in a.get("tags", []) if isinstance(t, str)) if isinstance(a, dict) else "".join(f'<span class="tag">{t}</span>' for t in a.tags)
        pills = _score_pills(a)
        rows += f"""
    <div class="article" id="article-{a.rank}">
      <div class="rank-badge">{label}</div>
      <h2><a href="{a.url}">{a.title}</a></h2>
      <p class="meta">{a.source} &middot; {a.date}</p>
      <p class="summary">{a.summary}</p>
      {pills}
      <div>{tags_html}</div>
    </div>"""

    count = len(articles)
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>{_CSS}</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>Newsletter Digest</h1>
    <p>Curated from your inbox &middot; {today} &middot; Ranked by originality, impact &amp; writing quality</p>
  </div>
  {nav}
  <div class="intro">
    <p>{count} article{'s' if count != 1 else ''} reviewed and ranked from newsletters in the last 24 hours.</p>
  </div>
  {rows}
  <div class="footer">
    Compiled automatically by Newsletter Agent &middot; {sender} &middot; {today}
  </div>
</div>
</body></html>"""


def build_plain_text(articles: list[Article]) -> str:
    """Build a minimal plain-text fallback for email clients without HTML support."""
    today = datetime.now().strftime("%B %d, %Y")
    lines = [
        f"Newsletter Digest — {today}",
        "=" * 48,
        "",
    ]
    for a in articles:
        lines += [
            f"#{a.rank} — {a.title}",
            f"Source: {a.source} | {a.date}",
            f"Score: {a.score:.1f}/10",
            f"URL: {a.url}",
            "",
            a.summary,
            "",
            "-" * 48,
            "",
        ]
    lines.append("Compiled by Newsletter Agent.")
    return "\n".join(lines)
