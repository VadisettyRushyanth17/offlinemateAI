from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import asyncio

from backend.database import (
    init_db,
    log_activity,
    get_recent_activities,
    clear_all_activities,
    save_task_plan,
    get_task_plans
)
from backend.ollama_client import (
    check_ollama_health,
    list_models,
    stream_chat,
    generate_response,
    summarize_text,
    grounded_qa,
    generate_task_plan,
    DEFAULT_MODEL,
    OllamaUnavailableException
)
from backend.document_parser import extract_text_from_bytes, DocumentParsingError

app = FastAPI(
    title="OfflineMate AI Backend",
    description="Privacy-first, 100% local AI runtime coordinator for notes, docs, and task planning",
    version="1.0.0"
)

# Enable CORS for frontend Vite dev server & local PWA
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    init_db()

# --- Health & Models ---

@app.get("/api/health")
async def health_check():
    ollama_info = await check_ollama_health()
    return {
        "status": "healthy",
        "service": "OfflineMate AI Backend",
        "mode": "100% Local / Offline-ready",
        "ollama": ollama_info
    }

@app.get("/api/models")
async def get_models():
    models = await list_models()
    return {"models": models, "default": DEFAULT_MODEL if DEFAULT_MODEL in models else (models[0] if models else "")}

# --- Chat Endpoint ---

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = DEFAULT_MODEL
    stream: Optional[bool] = True
    system_prompt: Optional[str] = None

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    model = request.model or DEFAULT_MODEL
    messages_dict = [{"role": m.role, "content": m.content} for m in request.messages]

    # Quick pre-flight check to verify Ollama is up
    health = await check_ollama_health()
    if not health.get("connected"):
        raise HTTPException(
            status_code=503,
            detail="Local AI is currently unavailable. Ensure Ollama is running at http://127.0.0.1:11434 and a local model is available."
        )

    # Log user prompt to activity history (first 80 chars)
    last_user_msg = next((m.content for m in reversed(request.messages) if m.role == "user"), "Chat message")
    log_activity(
        activity_type="chat",
        title=f"Chat: {last_user_msg[:60]}...",
        details=last_user_msg,
        meta={"model": model}
    )

    if request.stream:
        async def event_generator():
            async for chunk in stream_chat(
                messages=messages_dict,
                model=model,
                system_prompt=request.system_prompt
            ):
                # Send SSE format
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
    else:
        full_reply = ""
        async for chunk in stream_chat(
            messages=messages_dict,
            model=model,
            system_prompt=request.system_prompt
        ):
            full_reply += chunk
        return {"response": full_reply, "model": model}

# --- Document Processing ---

@app.post("/api/documents/extract")
async def extract_document(file: UploadFile = File(...)):
    try:
        content_bytes = await file.read()
        parsed = extract_text_from_bytes(file.filename, content_bytes)
        log_activity(
            activity_type="document_extract",
            title=f"Extracted: {file.filename}",
            details=f"Extracted {parsed['char_count']} chars, ~{parsed['estimated_tokens']} tokens",
            meta={"filename": file.filename, "size": parsed["size_bytes"]}
        )
        return parsed
    except DocumentParsingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected parsing error: {str(e)}")

class DocumentSummarizeRequest(BaseModel):
    text: str
    filename: Optional[str] = "Document"
    model: Optional[str] = DEFAULT_MODEL

@app.post("/api/documents/summarize")
async def summarize_document(req: DocumentSummarizeRequest):
    health = await check_ollama_health()
    if not health.get("connected"):
        raise HTTPException(
            status_code=503,
            detail="Local AI is unavailable for summarization. Ollama is not running."
        )

    try:
        summary = await summarize_text(req.text, model=req.model or DEFAULT_MODEL)
        log_activity(
            activity_type="document_summary",
            title=f"Summarized: {req.filename}",
            details=summary[:150] + "...",
            meta={"filename": req.filename, "model": req.model}
        )
        return {"summary": summary, "filename": req.filename, "model": req.model}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization error: {str(e)}")

class GroundedQARequest(BaseModel):
    document_context: str
    question: str
    filename: Optional[str] = "Document"
    model: Optional[str] = DEFAULT_MODEL

@app.post("/api/documents/query")
async def query_document(req: GroundedQARequest):
    health = await check_ollama_health()
    if not health.get("connected"):
        raise HTTPException(
            status_code=503,
            detail="Local AI is unavailable for document Q&A. Ollama is not running."
        )

    try:
        answer = await grounded_qa(req.document_context, req.question, model=req.model or DEFAULT_MODEL)
        log_activity(
            activity_type="document_query",
            title=f"Q&A on {req.filename}: {req.question[:50]}",
            details=answer[:150] + "...",
            meta={"filename": req.filename, "question": req.question}
        )
        return {"answer": answer, "filename": req.filename, "question": req.question}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Grounded Q&A error: {str(e)}")

# --- Task Planner Agent ---

class PlannerRequest(BaseModel):
    goal: str
    notes_context: Optional[str] = ""
    model: Optional[str] = DEFAULT_MODEL

@app.post("/api/planner")
async def create_plan(req: PlannerRequest):
    health = await check_ollama_health()
    if not health.get("connected"):
        raise HTTPException(
            status_code=503,
            detail="Local AI planner is unavailable. Ollama must be running."
        )

    try:
        plan_data = await generate_task_plan(
            goal=req.goal,
            notes_context=req.notes_context,
            model=req.model or DEFAULT_MODEL
        )

        plan_id = save_task_plan(
            title=plan_data.get("title", f"Plan: {req.goal[:30]}"),
            objective=plan_data.get("objective", req.goal),
            tasks=plan_data.get("tasks", []),
            approved=False
        )

        log_activity(
            activity_type="task_plan",
            title=f"Generated Plan: {plan_data.get('title')}",
            details=f"{len(plan_data.get('tasks', []))} tasks planned for '{req.goal[:60]}'",
            meta={"plan_id": plan_id, "tasks_count": len(plan_data.get("tasks", []))}
        )

        return {
            "plan_id": plan_id,
            "title": plan_data.get("title"),
            "objective": plan_data.get("objective"),
            "tasks": plan_data.get("tasks", []),
            "approved": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Planning generation failed: {str(e)}")

class ApprovePlanRequest(BaseModel):
    plan_id: int
    tasks: List[Dict[str, Any]]
    approved: bool = True

@app.post("/api/planner/approve")
async def approve_plan(req: ApprovePlanRequest):
    log_activity(
        activity_type="task_plan_approved",
        title=f"Approved Plan #{req.plan_id}",
        details=f"{len(req.tasks)} tasks approved by user",
        meta={"plan_id": req.plan_id, "approved": req.approved}
    )
    return {"status": "success", "plan_id": req.plan_id, "approved": req.approved}

# --- Activity History ---

@app.get("/api/history")
async def get_history():
    activities = get_recent_activities(100)
    task_plans = get_task_plans()
    return {
        "activities": activities,
        "task_plans": task_plans
    }

@app.delete("/api/history")
async def clear_history():
    clear_all_activities()
    return {"status": "cleared", "message": "All local backend logs and plan history cleared."}
