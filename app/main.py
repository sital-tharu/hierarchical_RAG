"""
main.py — FastAPI Application for Vectorless RAG
Endpoints:
  GET  /           → Health check
  POST /ingest     → Upload a PDF, build the PageIndex
  POST /query      → Ask a question against an ingested PDF
  GET  /indices    → List all ingested PDFs
  GET  /index/{n}  → Get the index.json for a specific PDF
"""
import os
import shutil
import logging
from pathlib import Path
import ujson
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.processor import build_page_index
from app.engine import query_pipeline
# ── Load environment ──
load_dotenv()
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "data/uploads"))
INDEX_DIR = Path(os.getenv("INDEX_DIR", "data/indices"))
# Ensure data dirs exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
INDEX_DIR.mkdir(parents=True, exist_ok=True)
# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-18s │ %(levelname)-7s │ %(message)s",
)
logger = logging.getLogger(__name__)
# ── FastAPI App ──
app = FastAPI(
    title="Indian Finance RAG (Vectorless)",
    description=(
        "A Retrieval-Augmented Generation system for Indian Financial "
        "Annual Reports that uses a hierarchical JSON PageIndex instead "
        "of a vector database. Powered by Ollama (Llama3 / Mistral)."
    ),
    version="1.0.0",
)
# ── CORS (allow frontend to call API) ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ── Serve frontend static files ──
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Request / Response Models
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class QueryRequest(BaseModel):
    question: str
    pdf_name: str
class QueryResponse(BaseModel):
    question: str
    selected_pages: list[int]
    answer: str
    status: str

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Routes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@app.get("/", tags=["Health"])
async def root():
    """Health check & welcome message."""
    return {
        "service": "Indian Finance RAG (Vectorless)",
        "model": OLLAMA_MODEL,
        "status": "running",
        "docs": "/docs",
    }
@app.get("/app", tags=["Frontend"], include_in_schema=False)
async def serve_frontend():
    """Serve the frontend GUI."""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return JSONResponse({"error": "Frontend not found"}, status_code=404)
