"""
processor.py — PDF Parsing & Hierarchical JSON Tree (PageIndex) Builder
Extracts text page-by-page from Indian Financial Annual Report PDFs,
generates rich structural summaries via Ollama, and persists as index.json.
"""
import os
import logging
from pathlib import Path
import ujson
from pypdf import PdfReader
import ollama
logger = logging.getLogger(__name__)
# ──────────────────────────────────────────────
# 1. PDF Text Extraction
# ──────────────────────────────────────────────
def extract_pages(pdf_path: str) -> dict[int, str]:
    """
    Read a PDF and return a dict mapping page numbers (1-indexed)
    to their raw extracted text.
    """
    reader = PdfReader(pdf_path)
    pages: dict[int, str] = {}
    for idx, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        text = text.strip()
        if text:
            pages[idx] = text
    logger.info("Extracted %d non-empty pages from %s", len(pages), pdf_path)
    return pages
