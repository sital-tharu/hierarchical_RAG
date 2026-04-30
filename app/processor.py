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
# ──────────────────────────────────────────────
# 2. Per-Page Structural Summary via Ollama
# ──────────────────────────────────────────────
SUMMARY_SYSTEM_PROMPT = """You are an expert Indian financial document analyst.
You understand Indian GAAP, Ind AS, SEBI regulations, and terminology such as
Crores, Lakhs, FY (Financial Year), Standalone vs Consolidated statements,
Schedule III of Companies Act, and common sections of Indian annual reports.
CRITICAL — Indian Financial Year (FY) Mapping:
  FY24 = April 1, 2023 → March 31, 2024  ("Year ended March 31, 2024")
  FY25 = April 1, 2024 → March 31, 2025  ("Year ended March 31, 2025")
  FY26 = April 1, 2025 → March 31, 2026  ("Year ended March 31, 2026")
  General rule: FY{YY} always ends on March 31, 20{YY}.
  When you see "Year ended March 31, 2026" — that is FY26, NOT FY24 or FY25.
Your task: Given the raw text of a SINGLE PAGE from an Indian company's
annual report, produce a concise 1-sentence structural summary that captures:
  1. The document section (e.g., Balance Sheet, P&L, Notes to Accounts,
     Director's Report, Auditor's Report, Cash Flow Statement, etc.)
  2. Key entities, figures, or values mentioned (e.g., Revenue: ₹5,432 Crores)
  3. The CORRECT financial year using FY notation (e.g., FY26 for year ended
     March 31, 2026) and statement type (Standalone / Consolidated)
Format: "Page {N}: <summary>"
Do NOT reproduce the full text. Be precise and information-dense."""
def generate_page_summary(
    page_num: int,
    text: str,
    model: str,
    base_url: str | None = None,
) -> str:
    """
    Call Ollama to generate a 1-sentence structural summary for a page.
    """
    user_prompt = f"Page number: {page_num}\n\n--- PAGE TEXT ---\n{text[:3000]}"
    client_kwargs = {}
    if base_url:
        client_kwargs["host"] = base_url
    client = ollama.Client(**client_kwargs)
    response = client.chat(
        model=model,
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": 0.2, "num_predict": 150},
    )
    summary = response["message"]["content"].strip()
    logger.debug("Page %d summary: %s", page_num, summary)
    return summary
# ──────────────────────────────────────────────
# 3. Build & Persist the PageIndex (index.json)
# ──────────────────────────────────────────────
def build_page_index(
    pdf_path: str,
    model: str,
    index_dir: str,
    base_url: str | None = None,
) -> dict:
    """
    End-to-end pipeline:
      1. Extract pages from the PDF
      2. Generate a structural summary for each page via Ollama
      3. Save as index.json inside `index_dir/<pdf_stem>/`
    Returns the full index dict.
    """
    pdf_stem = Path(pdf_path).stem
    output_dir = Path(index_dir) / pdf_stem
    output_dir.mkdir(parents=True, exist_ok=True)
    # Step 1 — Extract
    pages_text = extract_pages(pdf_path)
    # Step 2 — Summarise each page
    index: dict[str, dict] = {}
    total = len(pages_text)
    for i, (page_num, text) in enumerate(pages_text.items(), start=1):
        logger.info("Summarising page %d / %d ...", i, total)
        summary = generate_page_summary(page_num, text, model, base_url)
        index[str(page_num)] = {
            "page": page_num,
            "summary": summary,
            "char_count": len(text),
        }
    # Step 3 — Persist
    index_path = output_dir / "index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        ujson.dump(index, f, indent=2, ensure_ascii=False)
    # Also persist raw text for the Reader step
    raw_path = output_dir / "pages.json"
    with open(raw_path, "w", encoding="utf-8") as f:
        ujson.dump({str(k): v for k, v in pages_text.items()}, f, ensure_ascii=False)
    logger.info("Index saved → %s  (%d pages)", index_path, len(index))
    return index