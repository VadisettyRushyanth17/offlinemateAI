import React, { useState, useEffect } from 'react';
import {
  getAllNotes,
  getAllDocuments,
  getAllTaskPlans,
  getAllChats,
  getSetting,
  setSetting
} from '../db/indexedDb';

interface SettingsViewProps {
  isAiConnected: boolean;
  activeModel: string;
  setActiveModel: (model: string) => void;
  availableModels: string[];
  isBrowserOnline: boolean;
  onRefreshHealth: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isAiConnected,
  activeModel,
  setActiveModel,
  availableModels,
  isBrowserOnline,
  onRefreshHealth
}) => {
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [stats, setStats] = useState({ notes: 0, docs: 0, tasks: 0, chats: 0 });
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
    loadStats();
  }, []);

  const loadSettings = async () => {
    const url = await getSetting('ollamaUrl', 'http://127.0.0.1:11434');
    setOllamaUrl(url);
  };

  const loadStats = async () => {
    const [notes, docs, tasks, chats] = await Promise.all([
      getAllNotes(),
      getAllDocuments(),
      getAllTaskPlans(),
      getAllChats()
    ]);
    setStats({
      notes: notes.length,
      docs: docs.length,
      tasks: tasks.length,
      chats: chats.length
    });
  };

  const handleSaveSettings = async () => {
    await setSetting('ollamaUrl', ollamaUrl);
    await setSetting('selectedModel', activeModel);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
    onRefreshHealth();
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <h2>Settings & Runtime Diagnostics</h2>
        <p>Configure local AI parameters, manage device storage, and inspect offline capabilities.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Ollama & AI Runtime Panel */}
        <div className="card-panel">
          <h3 style={{ fontSize: '16px', color: '#FFFFFF', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡</span> Local AI Configuration
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Ollama Endpoint URL
              </label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Default local Ollama daemon port
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Active Local Model
              </label>
              <select
                value={activeModel}
                onChange={(e) => setActiveModel(e.target.value)}
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
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>
                Ollama Status:
              </div>
              <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`status-dot ${isAiConnected ? 'connected' : 'disconnected'}`}></span>
                <span style={{ color: isAiConnected ? 'var(--emerald-accent)' : 'var(--rose-accent)' }}>
                  {isAiConnected ? `Connected to ${activeModel}` : 'Ollama not responding on 127.0.0.1:11434'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-primary" onClick={handleSaveSettings}>
                {savedSuccess ? '✓ Settings Saved!' : 'Save Settings'}
              </button>
              <button className="btn btn-secondary" onClick={onRefreshHealth}>
                Test Connection
              </button>
            </div>
          </div>
        </div>

        {/* Offline & Storage Diagnostic Panel */}
        <div className="card-panel">
          <h3 style={{ fontSize: '16px', color: '#FFFFFF', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💾</span> Offline & Storage Health
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Saved Notes</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF' }}>{stats.notes}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Documents</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--cyan-accent)' }}>{stats.docs}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Task Plans</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--emerald-accent)' }}>{stats.tasks}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Chat Threads</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--amber-accent)' }}>{stats.chats}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '12px' }}>
              <div style={{ fontWeight: 600, color: '#FFFFFF', marginBottom: '6px' }}>Two-Tier Offline Architecture:</div>
              <ul style={{ paddingLeft: '16px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>
                  <strong style={{ color: '#FFFFFF' }}>Level 1 (PWA Cache + IndexedDB):</strong> Active! All notes and settings persist even if the network or backend is offline.
                </li>
                <li>
                  <strong style={{ color: '#FFFFFF' }}>Level 2 (Genuine Offline AI):</strong> Powered by local Ollama on port 11434. No cloud calls are ever initiated.
                </li>
              </ul>
            </div>

            {/* Quick Command Reference */}
            <div style={{ padding: '12px', background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--cyan-accent)' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}># Start or switch Ollama model locally:</div>
              ollama run qwen3.5:4b
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
