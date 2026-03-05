from __future__ import annotations

import logging
from html import escape
from importlib import import_module

logger = logging.getLogger(__name__)


def render_markdown_to_html(markdown_text: str) -> str:
    """Render markdown safely for server-side template output."""
    try:
        module = import_module("markdown_it")
        markdown_it_class = module.MarkdownIt
        markdown_parser = markdown_it_class("commonmark", {"html": False}).enable("table")
        return str(markdown_parser.render(markdown_text))
    except Exception as exc:
        logger.warning("markdown rendering fallback enabled: %s", str(exc))
        # Keep page usable even if markdown dependency is unavailable.
        return f"<pre>{escape(markdown_text)}</pre>"
