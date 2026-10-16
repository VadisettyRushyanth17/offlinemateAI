import React from 'react';

interface StatusBarProps {
  isBrowserOnline: boolean;
  isAiConnected: boolean;
  activeModel: string;
  isBackendReachable: boolean;
  onRefreshHealth: () => void;
  isChecking: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isBrowserOnline,
  isAiConnected,
  activeModel,
  isBackendReachable,
  onRefreshHealth,
  isChecking,
}) => {
  // Determine accurate status combinations
  let aiStatusText = 'Checking Local AI...';
  let aiDotClass = 'warning';

  if (!isBackendReachable) {
    aiStatusText = 'Local Backend Stopped';
    aiDotClass = 'disconnected';
  } else if (isAiConnected) {
    aiStatusText = `Local AI Connected (${activeModel || 'Ready'})`;
    aiDotClass = 'connected';
  } else {
    aiStatusText = 'Local AI Unavailable (Start Ollama)';
    aiDotClass = 'disconnected';
  }

  // Determine Website / Network level
  let webStatusText = isBrowserOnline ? 'Online' : 'Website Offline (Cached PWA)';
  let webDotClass = isBrowserOnline ? 'connected' : 'warning';

  return (
    <header className="status-bar">
      <div className="status-left">
        {/* Local AI Status Pill */}
        <div
          className="status-pill"
          title={
            isAiConnected
              ? `Local Ollama is running and responding with model ${activeModel}. Inference is 100% on-device.`
              : 'Ollama is not responding at http://127.0.0.1:11434. Start Ollama to activate AI features.'
          }
        >
          <span className={`status-dot ${aiDotClass}`}></span>
          <span style={{ fontWeight: 600 }}>{aiStatusText}</span>
        </div>

        {/* Website / Cache Level Pill */}
        <div
          className="status-pill"
          title={
            isBrowserOnline
              ? 'External internet connectivity detected.'
              : 'No external internet. Interface and notes load completely from local Service Worker & IndexedDB cache.'
          }
        >
          <span className={`status-dot ${webDotClass}`}></span>
          <span>{webStatusText}</span>
        </div>
      </div>

      <div className="status-right">
        {activeModel && (
          <span className="model-badge" title="Active local model name">
            ⚡ {activeModel}
          </span>
        )}

        <button
          className="btn btn-secondary"
          style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px' }}
          onClick={onRefreshHealth}
          disabled={isChecking}
          title="Probe Ollama & backend runtime status"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animation: isChecking ? 'spin 1s linear infinite' : 'none' }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          {isChecking ? 'Checking...' : 'Ping AI'}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  );
};
