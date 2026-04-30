"""
engine.py — 3-Step Ollama Reasoning Engine (Navigator → Reader → Expert)
Implements the Vectorless RAG query pipeline:
  Step A  (Navigator): Identify the most relevant pages from the index
  Step B  (Reader):    Extract raw text from those pages
  Step C  (Expert):    Generate a SEBI-grade financial answer
"""
import logging
import re
import ujson
import ollama
logger = logging.getLogger(__name__)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step A — The Navigator
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NAVIGATOR_SYSTEM_PROMPT = """You are an expert navigator for Indian financial annual reports.
You understand Indian accounting standards (Ind AS / Indian GAAP), SEBI disclosures,
and report structures including:
  - Director's Report, Management Discussion & Analysis (MD&A)
  - Standalone & Consolidated Balance Sheet, P&L, Cash Flow
  - Notes to Financial Statements, Schedules
  - Auditor's Report, Corporate Governance Report
  - Terms like Crores, Lakhs, FY (Financial Year)
CRITICAL — Indian Financial Year (FY) Mapping:
  FY24 = April 1, 2023 → March 31, 2024  ("Year ended March 31, 2024")
  FY25 = April 1, 2024 → March 31, 2025  ("Year ended March 31, 2025")
  FY26 = April 1, 2025 → March 31, 2026  ("Year ended March 31, 2026")
  General rule: FY{YY} ends on March 31, 20{YY}.
When the user asks about a specific FY, you MUST select pages that contain
data for that EXACT financial year. For example, if the user asks about FY24,
select pages with data for the year ended March 31, 2024 — NOT March 31, 2025
or March 31, 2026.
You will be given:
  1. A user's finance question
  2. A JSON index mapping page numbers to structural summaries
Your job: Identify the 2-3 page numbers whose content is MOST LIKELY
to contain the exact data needed to answer the question.
Respond ONLY with a JSON array of page numbers, e.g. [5, 12, 13].
Nothing else. No explanation."""
def navigate(
    question: str,
    index: dict,
    model: str,
    base_url: str | None = None,
) -> list[int]:
    """
    Step A: Send the question + full index.json to Ollama.
    Returns a list of 2-3 page numbers.
    """
    index_text = ujson.dumps(index, indent=2, ensure_ascii=False)
    user_prompt = (
        f"QUESTION: {question}\n\n"
        f"PAGE INDEX:\n{index_text}\n\n"
        "Which 2-3 page numbers contain the data to answer this question? "
        "Reply ONLY with a JSON array of integers."
    )
    client_kwargs = {}
    if base_url:
        client_kwargs["host"] = base_url
    client = ollama.Client(**client_kwargs)
    response = client.chat(
        model=model,
        messages=[
            {"role": "system", "content": NAVIGATOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": 0.1, "num_predict": 50},
    )
    raw = response["message"]["content"].strip()
    logger.info("Navigator raw response: %s", raw)
    page_nums = _parse_page_numbers(raw)
    logger.info("Navigator selected pages: %s", page_nums)
    return page_nums
def _parse_page_numbers(raw: str) -> list[int]:
    """
    Robustly extract a list of integers from the LLM's response.
    Handles formats like: [5, 12], "5, 12", or just "5 12".
    """
    # Try JSON parse first
    try:
        parsed = ujson.loads(raw)
        if isinstance(parsed, list):
            return [int(x) for x in parsed]
    except (ValueError, TypeError):
        pass
    # Fallback: extract all integers from the string
    numbers = re.findall(r"\d+", raw)
    return [int(n) for n in numbers[:3]]  # cap at 3 pages

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step B — The Reader
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def read_pages(page_nums: list[int], pages_text: dict[str, str]) -> str:
    """
    Step B: Extract and concatenate raw text from the selected pages.
    """
    chunks = []
    for pn in page_nums:
        key = str(pn)
        if key in pages_text:
            chunks.append(f"\n{'='*60}\n PAGE {pn} \n{'='*60}\n{pages_text[key]}")
        else:
            logger.warning("Page %d not found in stored text — skipping", pn)
    combined = "\n".join(chunks)
    logger.info(
        "Reader extracted %d chars from %d pages",
        len(combined), len(chunks),
    )
    return combined
