import httpx
import json
import re
from typing import List, Dict, Any, AsyncGenerator, Optional

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "qwen3.5:4b"

class OllamaUnavailableException(Exception):
    def __init__(self, message: str = "Local Ollama service is unavailable at http://127.0.0.1:11434"):
        super().__init__(message)
        self.message = message

async def check_ollama_health(base_url: str = OLLAMA_BASE_URL) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{base_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name") for m in data.get("models", [])]
                return {
                    "connected": True,
                    "models": models,
                    "default_model": DEFAULT_MODEL if DEFAULT_MODEL in models else (models[0] if models else None),
                    "url": base_url,
                }
            return {"connected": False, "models": [], "error": f"Ollama HTTP {resp.status_code}"}
    except Exception as e:
        return {"connected": False, "models": [], "error": str(e)}

async def list_models(base_url: str = OLLAMA_BASE_URL) -> List[str]:
    health = await check_ollama_health(base_url)
    return health.get("models", [])

async def stream_chat(
    messages: List[Dict[str, str]],
    model: str = DEFAULT_MODEL,
    base_url: str = OLLAMA_BASE_URL,
    system_prompt: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """Streams chat responses as SSE or raw tokens."""
    payload: Dict[str, Any] = {
        "model": model,
        "stream": True,
        "messages": []
    }
    if system_prompt:
        payload["messages"].append({"role": "system", "content": system_prompt})
    payload["messages"].extend(messages)

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", f"{base_url}/api/chat", json=payload) as response:
                if response.status_code != 200:
                    err_text = await response.aread()
                    yield f"Error from Ollama ({response.status_code}): {err_text.decode('utf-8', errors='ignore')}"
                    return

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if "message" in data and "content" in data["message"]:
                            yield data["message"]["content"]
                        if data.get("done", False):
                            break
                    except json.JSONDecodeError:
                        continue
    except httpx.ConnectError:
        yield "Error: Could not connect to local Ollama runtime at 127.0.0.1:11434. Please verify Ollama is running."
    except Exception as e:
        yield f"Inference Error: {str(e)}"

async def generate_response(
    prompt: str,
    model: str = DEFAULT_MODEL,
    system_prompt: Optional[str] = None,
    base_url: str = OLLAMA_BASE_URL
) -> str:
    payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False
    }
    if system_prompt:
        payload["system"] = system_prompt

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{base_url}/api/generate", json=payload)
            if resp.status_code != 200:
                raise OllamaUnavailableException(f"Ollama returned HTTP {resp.status_code}: {resp.text}")
            data = resp.json()
            return data.get("response", "")
    except httpx.ConnectError:
        raise OllamaUnavailableException("Cannot connect to Ollama. Ensure Ollama is running locally.")
    except Exception as e:
        raise RuntimeError(f"Ollama generation failed: {str(e)}")

async def summarize_text(
    text: str,
    model: str = DEFAULT_MODEL,
    base_url: str = OLLAMA_BASE_URL
) -> str:
    system_prompt = (
        "You are OfflineMate AI, an expert offline assistant. "
        "Provide a crisp, high-value summary of the provided text. "
        "Structure your response with: \n"
        "1. Executive Overview (2-3 sentences)\n"
        "2. Key Takeaways / Bullet Points\n"
        "3. Action Items or Conclusions (if applicable)."
    )
    prompt = f"Please summarize the following document content:\n\n{text}"
    return await generate_response(prompt, model=model, system_prompt=system_prompt, base_url=base_url)

async def grounded_qa(
    document_context: str,
    question: str,
    model: str = DEFAULT_MODEL,
    base_url: str = OLLAMA_BASE_URL
) -> str:
    system_prompt = (
        "You are OfflineMate AI, a local grounded document assistant. "
        "Answer the user's question STRICTLY based on the provided document context below. "
        "If the answer cannot be determined from the context, clearly state: "
        "'This information is not found in the provided document.' "
        "Never make up facts outside the provided document."
    )
    prompt = f"DOCUMENT CONTEXT:\n\"\"\"\n{document_context}\n\"\"\"\n\nUSER QUESTION: {question}\n\nGROUNDED ANSWER:"
    return await generate_response(prompt, model=model, system_prompt=system_prompt, base_url=base_url)

async def generate_task_plan(
    goal: str,
    notes_context: str = "",
    model: str = DEFAULT_MODEL,
    base_url: str = OLLAMA_BASE_URL
) -> Dict[str, Any]:
    system_prompt = (
        "You are OfflineMate Task Planner Agent. Your job is to transform a user goal into "
        "a concrete, structured, actionable task plan.\n"
        "You MUST respond ONLY with a valid JSON object matching this exact schema:\n"
        "{\n"
        '  "title": "Short title of the plan",\n'
        '  "objective": "Brief summary of the intended outcome",\n'
        '  "tasks": [\n'
        '    {\n'
        '      "id": 1,\n'
        '      "title": "Specific action name",\n'
        '      "description": "Details on how to execute",\n'
        '      "category": "Preparation | Execution | Review",\n'
        '      "estimated_minutes": 30,\n'
        '      "priority": "High | Medium | Low"\n'
        '    }\n'
        '  ]\n'
        "}\n"
        "Do NOT include markdown backticks or commentary outside the JSON."
    )

    prompt = f"User Goal: {goal}"
    if notes_context:
        prompt += f"\n\nRelevant Notes Context:\n{notes_context}"

    raw = await generate_response(prompt, model=model, system_prompt=system_prompt, base_url=base_url)

    # Clean JSON output if model included markdown wraps
    cleaned = raw.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        if "tasks" in data and isinstance(data["tasks"], list):
            return data
    except Exception:
        # Fallback regex extraction if model hallucinated wrapper text
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
                if "tasks" in data:
                    return data
            except Exception:
                pass

    # Safe deterministic fallback plan structure if LLM didn't return perfect JSON
    return {
        "title": f"Plan: {goal[:40]}",
        "objective": goal,
        "tasks": [
            {
                "id": 1,
                "title": "Review requirements and context",
                "description": f"Gather materials related to: {goal}",
                "category": "Preparation",
                "estimated_minutes": 20,
                "priority": "High"
            },
            {
                "id": 2,
                "title": "Execute primary actions",
                "description": "Carry out core steps required for the plan",
                "category": "Execution",
                "estimated_minutes": 45,
                "priority": "High"
            },
            {
                "id": 3,
                "title": "Verify and validate outcome",
                "description": "Review results and check completeness",
                "category": "Review",
                "estimated_minutes": 15,
                "priority": "Medium"
            }
        ]
    }
