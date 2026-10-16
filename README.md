# OfflineMate AI — Offline Personal AI Agent

> **"Your AI. Your files. Your device. No internet required."**

Built for **HackOctober**, OfflineMate AI is a privacy-first, fully local personal AI assistant designed for students, researchers, developers, and privacy-conscious users who need dependable intelligence without relying on cloud services or internet connectivity.

---

## 🌟 Key Features

### 1. 🤖 Feature A: AI Chat
- Connects directly to your local **Ollama** runtime (`http://127.0.0.1:11434`) via our lightweight FastAPI backend.
- Supports real-time streaming tokens with an active model selector (e.g. `qwen3.5:4b`).
- **Context Injection**: Quickly attach excerpts from your local notes or documents to ground your prompt.
- **Strict Honesty**: Never outputs simulated or mock AI output. If Ollama is paused or stopped, it clearly displays local status and instructions.

### 2. 📝 Feature B: Smart Notes
- Fast, rich markdown and plain-text note editor backed by browser **IndexedDB**.
- **100% Offline (Level 1)**: Works seamlessly even when the backend is completely offline.
- Features title, content, comma-separated tags, tag filtering chips, and real-time keyword search.
- **"Summarize with AI"**: Leverages local AI to extract executive summaries and bullet points directly into the note.

### 3. 📂 Feature C: Local Document Assistant
- Supports local drag-and-drop or file upload for `.pdf`, `.txt`, `.md`, `.csv`, `.json`, and source code.
- **Local Extraction**: Safe parsing with size boundaries (up to 10MB, bounded character limits) to protect low-resource devices.
- **Grounded Q&A (RAG)**: Ask questions strictly grounded in the document content; the local model answers with zero hallucinations outside the text.
- **Zero Cloud Transmission**: Files never leave your local device.

### 4. 📋 Feature D: Task Planner Agent
- Natural language agent goal input (e.g., *"Help me prepare for my exam using my saved notes"*).
- The agent analyzes the user's goal along with saved local notes context.
- **Review & Approval Flow**: Produces a structured, editable plan with task titles, descriptions, categories, estimated minutes, and priorities.
- Allows users to add, edit, or remove tasks before approving.
- Interactive execution checklist with completion toggle and progress bar.

### 5. 📜 Feature E: Local Activity History & Data Privacy
- Unified timeline logging chats, document summaries, notes, and approved plans.
- Filter by activity type (`chat`, `note`, `document`, `plan`).
- Privacy controls: **Export Workspace Data as JSON** and **Purge All History**.

---

## 🛡️ Two-Tier Offline Architecture

| Tier | Capability | Works When |
|---|---|---|
| **Level 1 — Website Offline** | Frontend App, Service Worker cache, IndexedDB Notes, Search, Task checklists, Local Settings | No internet connection; Backend stopped |
| **Level 2 — Genuine Offline AI** | AI Chat streaming, Document Grounded Q&A, Note Summarization, Task Plan Generation | Ollama runtime active on `127.0.0.1:11434` with model `qwen3.5:4b` |

---

## 🚀 Quick Start Guide

### Prerequisites
1. **Node.js** (v18+)
2. **Python** (v3.10+)
3. **Ollama** installed with model `qwen3.5:4b`:
   ```bash
   ollama run qwen3.5:4b
   ```

### Running OfflineMate AI

Run the one-click launcher:
```bash
run_app.bat
```
Or start each service separately:

#### 1. Start Python Backend:
```bash
start_backend.bat
# Runs FastAPI on http://127.0.0.1:8000
```

#### 2. Start Vite Frontend:
```bash
start_frontend.bat
# Runs Vite on http://localhost:5173
```

Open your browser to:
👉 **`http://localhost:5173`**

---

## 🏗️ Technical Stack

- **Frontend**: React 18, TypeScript, Vite, Vanilla CSS Design System.
- **Offline Website**: Progressive Web App (PWA), Service Worker (`sw.js`), Web App Manifest (`manifest.json`).
- **Client Storage**: Native IndexedDB (`OfflineMateDB`) for notes, tasks, documents, chat threads, and settings.
- **Backend**: Python FastAPI, Uvicorn, SQLite (`offline_mate.db`), PyPDF, HTTPX.
- **Local AI Runtime**: Ollama (`http://127.0.0.1:11434`) running `qwen3.5:4b`.
