import React, { useState, useEffect } from 'react';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { ChatView } from './components/ChatView';
import { NotesView } from './components/NotesView';
import { DocumentsView } from './components/DocumentsView';
import { PlannerView } from './components/PlannerView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { initSeedDataIfEmpty } from './db/indexedDb';
import { checkBackendHealth, getAvailableModels } from './services/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(navigator.onLine);
  const [isAiConnected, setIsAiConnected] = useState<boolean>(false);
  const [isBackendReachable, setIsBackendReachable] = useState<boolean>(false);
  const [activeModel, setActiveModel] = useState<string>('qwen3.5:4b');
  const [availableModels, setAvailableModels] = useState<string[]>(['qwen3.5:4b']);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [activeChatKey, setActiveChatKey] = useState<number>(Date.now());

  useEffect(() => {
    // Initialize sample notes if first run
    initSeedDataIfEmpty().catch(console.error);

    // Initial probe of local backend & Ollama
    refreshHealth();

    // Browser network listeners for PWA offline detection
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Polling interval for local AI heartbeat (every 10 seconds)
    const interval = setInterval(() => {
      refreshHealth(true);
    }, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const refreshHealth = async (silent: boolean = false) => {
    if (!silent) setIsCheckingHealth(true);
    try {
      const health = await checkBackendHealth();
      const reachable = health.status === 'healthy';
      setIsBackendReachable(reachable);

      if (reachable && health.ollama) {
        setIsAiConnected(health.ollama.connected);
        if (health.ollama.models && health.ollama.models.length > 0) {
          setAvailableModels(health.ollama.models);
          if (health.ollama.default_model) {
            setActiveModel(health.ollama.default_model);
          }
        }
      } else {
        setIsAiConnected(false);
      }
    } catch {
      setIsBackendReachable(false);
      setIsAiConnected(false);
    } finally {
      if (!silent) setIsCheckingHealth(false);
    }
  };

  const handleNewChat = () => {
    setActiveChatKey(Date.now());
    setActiveTab('chat');
  };

  return (
    <div className="app-layout">
      {/* Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onNewChat={handleNewChat}
        selectedModel={activeModel}
      />

      {/* Main Area */}
      <main className="main-area">
        {/* Status Bar */}
        <StatusBar
          isBrowserOnline={isBrowserOnline}
          isAiConnected={isAiConnected}
          activeModel={activeModel}
          isBackendReachable={isBackendReachable}
          onRefreshHealth={() => refreshHealth(false)}
          isChecking={isCheckingHealth}
        />

        {/* View Switcher */}
        {activeTab === 'chat' && (
          <ChatView
            key={activeChatKey}
            activeModel={activeModel}
            availableModels={availableModels}
            isAiConnected={isAiConnected}
          />
        )}

        {activeTab === 'notes' && (
          <NotesView
            isAiConnected={isAiConnected}
            activeModel={activeModel}
          />
        )}

        {activeTab === 'documents' && (
          <DocumentsView
            isAiConnected={isAiConnected}
            activeModel={activeModel}
          />
        )}

        {activeTab === 'planner' && (
          <PlannerView
            isAiConnected={isAiConnected}
            activeModel={activeModel}
          />
        )}

        {activeTab === 'history' && <HistoryView />}

        {activeTab === 'settings' && (
          <SettingsView
            isAiConnected={isAiConnected}
            activeModel={activeModel}
            setActiveModel={setActiveModel}
            availableModels={availableModels}
            isBrowserOnline={isBrowserOnline}
            onRefreshHealth={() => refreshHealth(false)}
          />
        )}
      </main>
    </div>
  );
};
