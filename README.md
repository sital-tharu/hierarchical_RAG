# 🇮🇳 Vectorless RAG — Indian Financial Annual Report Analyzer

A **Retrieval-Augmented Generation** system for Indian Financial Annual Reports that replaces traditional vector databases with a **hierarchical JSON PageIndex**. Powered by **FastAPI** and **Ollama** (Llama3 / Mistral).

## 🏗️ Architecture

```
PDF Upload → pypdf (page extract) → Ollama (per-page summary) → index.json (PageIndex)

User Query → Step A: Navigator (pick pages) → Step B: Reader (extract text) → Step C: Expert (SEBI-grade answer)
```

**No vector database. No embeddings.** Just structured JSON indexing + multi-step LLM reasoning.

## 📁 Project Structure

```
vectorless_RAG/
├── app/
│   ├── __init__.py        # Package init
│   ├── processor.py       # PDF parsing & JSON PageIndex builder
│   ├── engine.py          # 3-step Ollama reasoning engine
│   └── main.py            # FastAPI routes
├── frontend/
│   ├── index.html         # Single-page glassmorphism GUI
│   ├── css/styles.css     # All styles
│   └── js/app.js          # All frontend logic
├── data/
│   ├── uploads/           # Uploaded PDFs
│   └── indices/           # Generated JSON indices
├── requirements.txt
├── .env.example
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- [Ollama](https://ollama.ai/) installed and running locally
- A pulled model: `ollama pull llama3` or `ollama pull mistral`

### Setup

```bash
# Clone the repo
git clone https://github.com/sital-tharu/vectorless_RAG.git
cd vectorless_RAG

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate    # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env     # Windows

# Start the server
python -m uvicorn app.main:app --reload --port 8000
```

### Usage

Open **http://localhost:8000/docs** for the Swagger UI.

1. **Ingest a PDF**: `POST /ingest` → Upload an Indian annual report PDF
2. **Query it**: `POST /query` → Ask financial questions
3. **Browse indices**: `GET /indices` → See all ingested reports
4. **Frontend GUI**: `http://localhost:8000/app`

## 🧠 How It Works

| Step | Name | What It Does |
|------|------|-------------|
| **A** | Navigator | Sends user question + full PageIndex to Ollama → selects 2-3 most relevant pages |
| **B** | Reader | Extracts raw text from only those selected pages |
| **C** | Expert | Answers using a SEBI-certified analyst system prompt with strict grounding rules |

## 🇮🇳 Indian Finance Features

- **FY Mapping**: `FY24 = April 2023 – March 2024` (hardcoded in all prompts to prevent hallucination)
- **Terminology**: Understands Crores, Lakhs, PAT, EBITDA, EPS, Ind AS, Indian GAAP
- **Statement Types**: Distinguishes Standalone vs Consolidated
- **SEBI Compliance**: Expert prompt understands LODR, Schedule III, Related Party Transactions

## ⚙️ Configuration

Edit `.env` to customize:

```env
OLLAMA_MODEL=llama3          # or mistral
OLLAMA_BASE_URL=http://localhost:11434
UPLOAD_DIR=data/uploads
INDEX_DIR=data/indices
```

## 📦 Tech Stack

| Package | Purpose |
|---------|---------|
| FastAPI | REST API framework |
| Ollama | Local LLM inference |
| pypdf | PDF text extraction |
| cryptography | Encrypted PDF support |
| ujson | Fast JSON serialization |
