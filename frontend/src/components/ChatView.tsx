import React, { useState, useEffect, useRef } from 'react';
import {
  ChatSession,
  ChatMessageItem,
  getAllChats,
  saveChat,
  getAllNotes,
  getAllDocuments,
  Note,
  LocalDocument
} from '../db/indexedDb';
import { streamAIChat } from '../services/api';

interface ChatViewProps {
  activeModel: string;
  availableModels: string[];
  isAiConnected: boolean;
  activeChatId?: string | null;
  onChatCreated?: (id: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  activeModel,
  availableModels,
  isAiConnected,
  activeChatId,
  onChatCreated
}) => {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatId, setChatId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>(activeModel || 'qwen3.5:4b');
  const [availableNotes, setAvailableNotes] = useState<Note[]>([]);
  const [availableDocs, setAvailableDocs] = useState<LocalDocument[]>([]);
  const [showContextPicker, setShowContextPicker] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Sync selected model with parent activeModel if available
  useEffect(() => {
    if (activeModel) {
      setSelectedModel(activeModel);
    }
  }, [activeModel]);

  // Load chat or initialize fresh session
  useEffect(() => {
    loadNotesAndDocs();
    if (activeChatId) {
      loadSpecificChat(activeChatId);
    } else {
      initNewChat();
    }
  }, [activeChatId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const loadNotesAndDocs = async () => {
    const notes = await getAllNotes();
    const docs = await getAllDocuments();
    setAvailableNotes(notes);
    setAvailableDocs(docs);
  };

  const initNewChat = () => {
    const newId = 'chat_' + Date.now();
    setChatId(newId);
    setMessages([
      {
        id: 'msg_welcome',
        role: 'assistant',
        content: `👋 **OfflineMate AI is ready.**\n\nI am your 100% private, on-device AI assistant powered by **${selectedModel}**. All prompts, notes, and file queries stay strictly on your local machine.\n\nHow can I help you today?`,
        timestamp: new Date().toISOString()
      }
    ]);
    if (onChatCreated) onChatCreated(newId);
  };

  const loadSpecificChat = async (id: string) => {
    const all = await getAllChats();
    const found = all.find((c) => c.id === id);
    if (found) {
      setChatId(found.id);
      setMessages(found.messages);
      setSelectedModel(found.model || selectedModel);
    } else {
      initNewChat();
    }
  };

  const handleSendMessage = async () => {
    const text = inputPrompt.trim();
    if (!text || isGenerating) return;

    if (!isAiConnected) {
      const offlineMsg: ChatMessageItem = {
        id: 'msg_err_' + Date.now(),
        role: 'assistant',
        content: '⚠️ **Local AI is currently unavailable.**\n\nOfflineMate cannot generate responses because Ollama is not reachable on `http://127.0.0.1:11434` or the requested model is missing.\n\nPlease start Ollama and ensure your local model (`qwen3.5:4b`) is loaded. Never will OfflineMate fake an AI response.',
        timestamp: new Date().toISOString(),
        error: true
      };
      setMessages((prev) => [...prev, { id: 'msg_' + Date.now(), role: 'user', content: text, timestamp: new Date().toISOString() }, offlineMsg]);
      setInputPrompt('');
      return;
    }

    const userMsg: ChatMessageItem = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputPrompt('');
    setIsGenerating(true);

    const assistantMsgId = 'msg_asst_' + Date.now();
    let accumulatedContent = '';

    // Add empty assistant bubble
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
      }
    ]);

    abortControllerRef.current = new AbortController();

    // Prepare message payload
    const payload = newMessages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    await streamAIChat(
      payload,
      selectedModel,
      (chunk: string) => {
        accumulatedContent += chunk;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, content: accumulatedContent } : msg
          )
        );
      },
      async () => {
        setIsGenerating(false);
        // Persist completed chat to IndexedDB
        const finalMessages = newMessages.concat([
          {
            id: assistantMsgId,
            role: 'assistant',
            content: accumulatedContent,
            timestamp: new Date().toISOString()
          }
        ]);
        const session: ChatSession = {
          id: chatId,
          title: text.slice(0, 40) + '...',
          messages: finalMessages,
          model: selectedModel,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await saveChat(session);
      },
      (errorStr: string) => {
        setIsGenerating(false);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: `❌ **Inference Error**: ${errorStr}\n\n*All computation remains strictly local.*`,
                  error: true
                }
              : msg
          )
        );
      },
      abortControllerRef.current.signal
    );
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  };

  const insertContextNote = (note: Note) => {
    const snippet = `\n\n[Context from Note: "${note.title}"]:\n"""\n${note.content}\n"""\n`;
    setInputPrompt((prev) => prev + snippet);
    setShowContextPicker(false);
  };

  const insertContextDoc = (doc: LocalDocument) => {
    const preview = doc.text.slice(0, 1500);
    const snippet = `\n\n[Context from Document: "${doc.filename}"]:\n"""\n${preview}\n"""\n`;
    setInputPrompt((prev) => prev + snippet);
    setShowContextPicker(false);
  };

  return (
    <div className="view-container">
      <div className="chat-wrapper">
        {/* Header with Model Selector & Context Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>AI Chat Assistant</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              100% offline neural inference via local Ollama
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Model:</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ width: 'auto', padding: '4px 10px', fontSize: '12px' }}
            >
              {availableModels.length > 0 ? (
                availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))
              ) : (
                <option value="qwen3.5:4b">qwen3.5:4b (Default)</option>
              )}
            </select>

            <button
              className="btn btn-secondary"
              style={{ padding: '5px 10px', fontSize: '12px' }}
              onClick={() => setShowContextPicker(!showContextPicker)}
              title="Attach a local note or document excerpt to your prompt"
            >
              📎 Insert Context
            </button>
          </div>
        </div>

        {/* Context Picker Dropdown */}
        {showContextPicker && (
          <div className="card-panel" style={{ marginTop: '8px', padding: '12px', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF' }}>Select Local Context to Inject:</span>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => setShowContextPicker(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', maxHeight: '180px', overflowY: 'auto' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--cyan-accent)', marginBottom: '4px', fontWeight: 600 }}>Saved Notes ({availableNotes.length})</div>
                {availableNotes.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => insertContextNote(n)}
                    style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', marginBottom: '4px' }}
                    className="hover-card"
                  >
                    📝 {n.title}
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--emerald-accent)', marginBottom: '4px', fontWeight: 600 }}>Local Documents ({availableDocs.length})</div>
                {availableDocs.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => insertContextDoc(d)}
                    style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', marginBottom: '4px' }}
                    className="hover-card"
                  >
                    📄 {d.filename}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message Stream */}
        <div className="chat-history">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble-wrap ${msg.role}`}>
              <div className={`avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>
                {msg.role === 'user' ? 'U' : 'AI'}
              </div>
              <div className={`chat-bubble ${msg.role}`}>
                {msg.content ? (
                  <div>{msg.content}</div>
                ) : (
                  <span style={{ color: 'var(--cyan-accent)', fontStyle: 'italic' }}>
                    Thinking locally...
                  </span>
                )}
                <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '6px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat Input Area */}
        <div className="chat-input-area">
          <div className="chat-input-box">
            <textarea
              rows={2}
              placeholder={
                isAiConnected
                  ? `Message OfflineMate (${selectedModel})... (Enter to send, Shift+Enter for new line)`
                  : "Local AI is offline. Start Ollama to chat, or manage your notes in 'My Notes'."
              }
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />

            {isGenerating ? (
              <button className="btn btn-danger" onClick={handleStopGeneration} title="Stop generation">
                ■ Stop
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSendMessage}
                disabled={!inputPrompt.trim()}
                title="Send local prompt"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
