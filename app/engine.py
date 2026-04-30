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

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step C — The Expert
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPERT_SYSTEM_PROMPT = """You are a SEBI-certified financial analyst with deep expertise in
Indian corporate finance and annual report analysis.
You understand:
  - Indian Accounting Standards (Ind AS) and Indian GAAP
  - Financial terminology: Crores, Lakhs, FY (Financial Year), PAT, EBITDA,
    EPS, Book Value, Debt-to-Equity, Promoter Holding
  - Standalone vs Consolidated financial statements
  - Schedule III format of the Companies Act 2013
  - SEBI LODR (Listing Obligations and Disclosure Requirements)
  - Related Party Transactions, Contingent Liabilities, Deferred Tax
CRITICAL — Indian Financial Year (FY) Mapping:
  FY24 = April 1, 2023 → March 31, 2024  ("Year ended March 31, 2024")
  FY25 = April 1, 2024 → March 31, 2025  ("Year ended March 31, 2025")
  FY26 = April 1, 2025 → March 31, 2026  ("Year ended March 31, 2026")
  General rule: FY{YY} always ends on March 31, 20{YY}.
RULES:
  1. Answer ONLY using the provided page context. Do NOT hallucinate data.
  2. If the context does not contain sufficient information, say so clearly.
  3. Quote specific figures with their units (₹ in Crores/Lakhs).
  4. Mention the source page number(s) in your answer.
  5. If comparing Standalone vs Consolidated, clarify which one you are citing.
  6. Be precise, professional, and concise.
  7. NEVER relabel data from one financial year as another. If the user asks
     for FY24 data but the context only contains FY26 data, explicitly state
     that FY24 data is not available in the provided pages.
  8. Always verify the calendar year in the context matches the requested FY
     (e.g., FY24 = "Year ended March 31, 2024"). If they don't match, say so."""
def answer(
    question: str,
    context: str,
    model: str,
    base_url: str | None = None,
) -> str:
    """
    Step C: Send the raw page text + question to Ollama with the
    SEBI expert system prompt. Returns the final analytical answer.
    """
    user_prompt = (
        f"QUESTION: {question}\n\n"
        f"CONTEXT (extracted pages from the annual report):\n{context}"
    )
    client_kwargs = {}
    if base_url:
        client_kwargs["host"] = base_url
    client = ollama.Client(**client_kwargs)
    response = client.chat(
        model=model,
        messages=[
            {"role": "system", "content": EXPERT_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": 0.3, "num_predict": 1024},
    )
    answer_text = response["message"]["content"].strip()
    logger.info("Expert answer length: %d chars", len(answer_text))
    return answer_text

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Full Pipeline Orchestrator
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def query_pipeline(
    question: str,
    index: dict,
    pages_text: dict[str, str],
    model: str,
    base_url: str | None = None,
) -> dict:
    """
    Run the complete 3-step pipeline and return a structured result.
    """
    # Step A — Navigate
    page_nums = navigate(question, index, model, base_url)
    # Step B — Read
    context = read_pages(page_nums, pages_text)
    if not context.strip():
        return {
            "question": question,
            "selected_pages": page_nums,
            "answer": "Could not find relevant content in the selected pages.",
            "status": "no_context",
        }
    # Step C — Expert Answer
    final_answer = answer(question, context, model, base_url)
    return {
        "question": question,
        "selected_pages": page_nums,
        "answer": final_answer,
        "status": "success",
    }