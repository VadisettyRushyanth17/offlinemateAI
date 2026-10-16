export interface HealthResponse {
  status: string;
  service: string;
  mode: string;
  ollama: {
    connected: boolean;
    models: string[];
    default_model: string | null;
    url: string;
    error?: string;
  };
}

export interface ExtractedDocResponse {
  filename: string;
  extension: string;
  size_bytes: number;
  char_count: number;
  estimated_tokens: number;
  pages_count: number;
  is_truncated: boolean;
  text: string;
}

export interface PlannerResponse {
  plan_id: number;
  title: string;
  objective: string;
  tasks: Array<{
    id: number;
    title: string;
    description: string;
    category: string;
    estimated_minutes: number;
    priority: 'High' | 'Medium' | 'Low';
  }>;
  approved: boolean;
}

const API_BASE = '/api';

export async function checkBackendHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    return {
      status: 'offline',
      service: 'OfflineMate AI Backend',
      mode: 'Client-only (Backend disconnected)',
      ollama: {
        connected: false,
        models: [],
        default_model: null,
        url: 'http://127.0.0.1:11434',
        error: err.message || 'Cannot reach local backend'
      }
    };
  }
}

export async function getAvailableModels(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/models`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

export async function streamAIChat(
  messages: Array<{ role: string; content: string }>,
  model: string,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model, stream: true }),
      signal
    });

    if (!res.ok) {
      let errDetail = `Server error ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.detail) errDetail = errJson.detail;
      } catch {}
      onError(errDetail);
      return;
    }

    if (!res.body) {
      onError('No response stream received from local backend.');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.chunk) {
            onChunk(parsed.chunk);
          }
        } catch {
          // ignore non-json lines
        }
      }
    }
    onDone();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      onDone();
      return;
    }
    onError(err.message || 'Error communicating with local AI');
  }
}

export async function uploadAndExtractDoc(file: File): Promise<ExtractedDocResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/documents/extract`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to extract document' }));
    throw new Error(err.detail || 'Failed to extract document');
  }

  return await res.json();
}

export async function summarizeDocAPI(text: string, filename: string, model: string): Promise<string> {
  const res = await fetch(`${API_BASE}/documents/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, filename, model })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to summarize document' }));
    throw new Error(err.detail || 'Summarization failed');
  }

  const data = await res.json();
  return data.summary;
}

export async function queryDocAPI(
  document_context: string,
  question: string,
  filename: string,
  model: string
): Promise<string> {
  const res = await fetch(`${API_BASE}/documents/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_context, question, filename, model })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to answer grounded question' }));
    throw new Error(err.detail || 'Grounded Q&A failed');
  }

  const data = await res.json();
  return data.answer;
}

export async function generateTaskPlanAPI(
  goal: string,
  notes_context: string,
  model: string
): Promise<PlannerResponse> {
  const res = await fetch(`${API_BASE}/planner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, notes_context, model })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to generate task plan' }));
    throw new Error(err.detail || 'Planner failed');
  }

  return await res.json();
}

export async function approvePlanAPI(plan_id: number, tasks: any[]): Promise<void> {
  await fetch(`${API_BASE}/planner/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id, tasks, approved: true })
  });
}

export async function getBackendHistoryAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/history`);
  if (!res.ok) return { activities: [], task_plans: [] };
  return await res.json();
}

export async function clearBackendHistoryAPI(): Promise<void> {
  await fetch(`${API_BASE}/history`, { method: 'DELETE' });
}
