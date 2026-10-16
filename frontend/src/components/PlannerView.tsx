import React, { useState, useEffect } from 'react';
import {
  TaskPlan,
  TaskItem,
  getAllTaskPlans,
  saveTaskPlanLocal,
  deleteTaskPlanLocal,
  getAllNotes
} from '../db/indexedDb';
import { generateTaskPlanAPI, approvePlanAPI } from '../services/api';

interface PlannerViewProps {
  isAiConnected: boolean;
  activeModel: string;
}

export const PlannerView: React.FC<PlannerViewProps> = ({ isAiConnected, activeModel }) => {
  const [plans, setPlans] = useState<TaskPlan[]>([]);
  const [activePlan, setActivePlan] = useState<TaskPlan | null>(null);
  const [goalInput, setGoalInput] = useState('');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [isPlanning, setIsPlanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Proposed plan stage (before approval)
  const [proposedPlan, setProposedPlan] = useState<{
    id: string;
    backendId?: number;
    title: string;
    objective: string;
    tasks: TaskItem[];
  } | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async (selectId?: string) => {
    const list = await getAllTaskPlans();
    setPlans(list);
    if (selectId) {
      const found = list.find((p) => p.id === selectId);
      if (found) setActivePlan(found);
    } else if (list.length > 0 && !activePlan) {
      setActivePlan(list[0]);
    }
  };

  const handleGeneratePlan = async () => {
    const goal = goalInput.trim();
    if (!goal || isPlanning) return;

    if (!isAiConnected) {
      setErrorMsg('Local AI is currently offline. Ollama must be running to generate agentic task plans.');
      return;
    }

    setIsPlanning(true);
    setErrorMsg(null);

    try {
      let notesContext = '';
      if (includeNotes) {
        const notes = await getAllNotes();
        notesContext = notes
          .map((n) => `Note "${n.title}": ${n.content.slice(0, 300)}`)
          .join('\n\n');
      }

      const res = await generateTaskPlanAPI(goal, notesContext, activeModel);

      // Convert to state for user review and approval
      const tasksWithCompleted: TaskItem[] = res.tasks.map((t, idx) => ({
        id: t.id || idx + 1,
        title: t.title,
        description: t.description,
        category: t.category || 'General',
        estimated_minutes: t.estimated_minutes || 30,
        priority: t.priority || 'Medium',
        completed: false
      }));

      setProposedPlan({
        id: 'plan_' + Date.now(),
        backendId: res.plan_id,
        title: res.title,
        objective: res.objective,
        tasks: tasksWithCompleted
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate task plan');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleUpdateProposedTask = (index: number, field: keyof TaskItem, value: any) => {
    if (!proposedPlan) return;
    const updatedTasks = [...proposedPlan.tasks];
    updatedTasks[index] = { ...updatedTasks[index], [field]: value };
    setProposedPlan({ ...proposedPlan, tasks: updatedTasks });
  };

  const handleAddProposedTask = () => {
    if (!proposedPlan) return;
    const newTask: TaskItem = {
      id: proposedPlan.tasks.length + 1,
      title: 'New action step',
      description: 'Describe the task here',
      category: 'Execution',
      estimated_minutes: 20,
      priority: 'Medium',
      completed: false
    };
    setProposedPlan({ ...proposedPlan, tasks: [...proposedPlan.tasks, newTask] });
  };

  const handleRemoveProposedTask = (index: number) => {
    if (!proposedPlan) return;
    const updated = proposedPlan.tasks.filter((_, idx) => idx !== index);
    setProposedPlan({ ...proposedPlan, tasks: updated });
  };

  const handleApprovePlan = async () => {
    if (!proposedPlan) return;

    const approvedPlan: TaskPlan = {
      id: proposedPlan.id,
      title: proposedPlan.title,
      objective: proposedPlan.objective,
      tasks: proposedPlan.tasks,
      approved: true,
      createdAt: new Date().toISOString()
    };

    // Save to local IndexedDB
    await saveTaskPlanLocal(approvedPlan);

    // Also notify backend if backendId is present
    if (proposedPlan.backendId) {
      await approvePlanAPI(proposedPlan.backendId, proposedPlan.tasks).catch(() => {});
    }

    setProposedPlan(null);
    setGoalInput('');
    await loadPlans(approvedPlan.id);
  };

  const handleToggleTaskCompleted = async (taskId: number) => {
    if (!activePlan) return;
    const updatedTasks = activePlan.tasks.map((t) =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );
    const updatedPlan: TaskPlan = {
      ...activePlan,
      tasks: updatedTasks
    };
    await saveTaskPlanLocal(updatedPlan);
    setActivePlan(updatedPlan);
    await loadPlans(updatedPlan.id);
  };

  const handleDeletePlan = async (id: string) => {
    if (confirm('Delete this plan and its tasks?')) {
      await deleteTaskPlanLocal(id);
      setActivePlan(null);
      await loadPlans();
    }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <h2>Task Planner Agent</h2>
        <p>Transform goals into structured, executable plans grounded in your local workspace.</p>
      </div>

      {errorMsg && (
        <div style={{ padding: '12px 16px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--rose-accent)', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Goal Prompt Generator Card */}
      <div className="card-panel" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', color: '#FFFFFF', marginBottom: '8px' }}>
          Create an Action Plan
        </h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="e.g. 'Help me prepare for my exam using my saved notes' or 'Plan offline presentation'"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGeneratePlan();
            }}
          />
          <button
            className="btn btn-primary"
            onClick={handleGeneratePlan}
            disabled={!goalInput.trim() || isPlanning}
            style={{ whiteSpace: 'nowrap' }}
          >
            {isPlanning ? 'Agent Planning...' : '⚡ Generate Plan'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              style={{ width: 'auto' }}
            />
            Include local notes context for grounding
          </label>
          <span>•</span>
          <span style={{ color: isAiConnected ? 'var(--emerald-accent)' : 'var(--text-muted)' }}>
            Model: {activeModel || 'qwen3.5:4b'}
          </span>
        </div>
      </div>

      {/* Proposed Plan Review & Approval Panel */}
      {proposedPlan && (
        <div className="card-panel" style={{ marginBottom: '24px', border: '1px solid var(--accent-primary)', background: 'rgba(99, 102, 241, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--cyan-accent)', fontWeight: 700, textTransform: 'uppercase' }}>
                REVIEW & APPROVE PLAN
              </span>
              <h3 style={{ fontSize: '18px', color: '#FFFFFF', marginTop: '2px' }}>
                {proposedPlan.title}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {proposedPlan.objective}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={handleAddProposedTask}>
                + Add Step
              </button>
              <button className="btn btn-primary" onClick={handleApprovePlan}>
                ✓ Approve & Save Plan
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setProposedPlan(null)}
              >
                Discard
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {proposedPlan.tasks.map((task, idx) => (
              <div
                key={task.id || idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1.5fr 2fr 100px 90px 40px',
                  gap: '10px',
                  alignItems: 'center',
                  background: 'var(--bg-secondary)',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>
                  #{idx + 1}
                </span>

                <input
                  type="text"
                  value={task.title}
                  onChange={(e) => handleUpdateProposedTask(idx, 'title', e.target.value)}
                  placeholder="Task title"
                />

                <input
                  type="text"
                  value={task.description}
                  onChange={(e) => handleUpdateProposedTask(idx, 'description', e.target.value)}
                  placeholder="Details"
                />

                <select
                  value={task.category}
                  onChange={(e) => handleUpdateProposedTask(idx, 'category', e.target.value)}
                  style={{ padding: '6px' }}
                >
                  <option value="Preparation">Preparation</option>
                  <option value="Execution">Execution</option>
                  <option value="Review">Review</option>
                  <option value="General">General</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    value={task.estimated_minutes}
                    onChange={(e) => handleUpdateProposedTask(idx, 'estimated_minutes', parseInt(e.target.value) || 15)}
                    style={{ width: '55px', padding: '6px' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>min</span>
                </div>

                <button
                  style={{ background: 'none', border: 'none', color: 'var(--rose-accent)', cursor: 'pointer', fontSize: '14px' }}
                  onClick={() => handleRemoveProposedTask(idx)}
                  title="Remove task"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plans List & Execution Workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', flex: 1 }}>
        {/* Left Column: Saved Plans Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Saved Action Plans ({plans.length})
          </div>

          {plans.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No plans created yet. Enter a goal above to plan!
            </div>
          ) : (
            plans.map((p) => {
              const completedCount = p.tasks.filter((t) => t.completed).length;
              const percent = p.tasks.length ? Math.round((completedCount / p.tasks.length) * 100) : 0;
              return (
                <div
                  key={p.id}
                  className={`note-card ${activePlan?.id === p.id ? 'active' : ''}`}
                  onClick={() => setActivePlan(p)}
                >
                  <div className="note-card-title">{p.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {completedCount} / {p.tasks.length} completed ({percent}%)
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${percent}%`, height: '100%', background: percent === 100 ? 'var(--emerald-accent)' : 'var(--accent-primary)', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Active Plan Tasks Checklist */}
        <div>
          {activePlan ? (
            <div className="card-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', color: '#FFFFFF', fontWeight: 700 }}>
                    {activePlan.title}
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {activePlan.objective}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-danger" onClick={() => handleDeletePlan(activePlan.id)}>
                    Delete Plan
                  </button>
                </div>
              </div>

              {/* Progress Summary */}
              {(() => {
                const total = activePlan.tasks.length;
                const done = activePlan.tasks.filter((t) => t.completed).length;
                const totalMins = activePlan.tasks.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
                const percent = total > 0 ? Math.round((done / total) * 100) : 0;

                return (
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Progress</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: percent === 100 ? 'var(--emerald-accent)' : '#FFFFFF' }}>
                        {percent}% Done ({done}/{total})
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Estimated Time</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--cyan-accent)' }}>
                        {totalMins} minutes
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Tasks List */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {activePlan.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`plan-task-item ${task.completed ? 'completed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => handleToggleTaskCompleted(task.id)}
                      className="task-checkbox"
                    />

                    <div className="task-content">
                      <div className="task-item-title">{task.title}</div>
                      {task.description && <div className="task-item-desc">{task.description}</div>}

                      <div className="task-meta">
                        <span className="tag-chip">{task.category}</span>
                        <span className={`badge-priority ${task.priority}`}>
                          {task.priority} Priority
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          ⏱ {task.estimated_minutes} min
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card-panel" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              Select a plan on the left or create a new plan above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
