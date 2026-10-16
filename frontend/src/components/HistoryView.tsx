import React, { useState, useEffect } from 'react';
import {
  ActivityItem,
  getAllActivities,
  clearAllLocalData,
  getAllNotes,
  getAllTaskPlans,
  getAllDocuments
} from '../db/indexedDb';
import { clearBackendHistoryAPI } from '../services/api';

export const HistoryView: React.FC = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    const list = await getAllActivities();
    setActivities(list);
  };

  const handleClearHistory = async () => {
    if (confirm('Clear all local activity history? Notes and documents will be kept, but timeline entries will be erased.')) {
      await clearAllLocalData();
      await clearBackendHistoryAPI().catch(() => {});
      await loadActivities();
    }
  };

  const handleExportWorkspace = async () => {
    const notes = await getAllNotes();
    const tasks = await getAllTaskPlans();
    const docs = await getAllDocuments();
    const history = await getAllActivities();

    const exportData = {
      exportedAt: new Date().toISOString(),
      appName: 'OfflineMate AI',
      notes,
      taskPlans: tasks,
      documents: docs.map((d) => ({ filename: d.filename, charCount: d.charCount, summary: d.summary })),
      history
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offlinemate_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = activities.filter((a) => (filterType === 'all' ? true : a.type === filterType));

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'chat':
        return '💬';
      case 'document':
        return '📄';
      case 'note':
        return '📝';
      case 'plan':
        return '📋';
      default:
        return '⚡';
    }
  };

  return (
    <div className="view-container">
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Local Activity History</h2>
          <p>Complete timeline of local chats, document extractions, notes, and task plans.</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={handleExportWorkspace} title="Export all local data as JSON">
            ⬇ Export JSON
          </button>
          <button className="btn btn-danger" onClick={handleClearHistory} title="Purge local activity history">
            Clear History
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {['all', 'chat', 'note', 'document', 'plan'].map((type) => (
          <button
            key={type}
            className="btn btn-secondary"
            style={{
              fontSize: '12px',
              padding: '6px 14px',
              background: filterType === type ? 'var(--accent-primary)' : undefined,
              borderColor: filterType === type ? 'var(--accent-primary)' : undefined,
              color: filterType === type ? '#FFFFFF' : undefined
            }}
            onClick={() => setFilterType(type)}
          >
            {type === 'all' ? 'All Activity' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
          </button>
        ))}
      </div>

      {/* Activity Timeline */}
      <div className="card-panel" style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            No activity logs found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  padding: '12px 14px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ fontSize: '18px', marginTop: '2px' }}>{getTypeIcon(item.type)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF', marginBottom: '2px' }}>
                    {item.title}
                  </div>
                  {item.details && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      {item.details}
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
