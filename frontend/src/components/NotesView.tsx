import React, { useState, useEffect } from 'react';
import { Note, getAllNotes, saveNote, deleteNote } from '../db/indexedDb';
import { summarizeDocAPI } from '../services/api';

interface NotesViewProps {
  isAiConnected: boolean;
  activeModel: string;
}

export const NotesView: React.FC<NotesViewProps> = ({ isAiConnected, activeModel }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Form edit states
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async (selectId?: string) => {
    const list = await getAllNotes();
    setNotes(list);
    if (selectId) {
      const found = list.find((n) => n.id === selectId);
      if (found) handleSelectNote(found);
    } else if (list.length > 0 && !selectedNote) {
      handleSelectNote(list[0]);
    }
  };

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note);
    setTitle(note.title);
    setContent(note.content);
    setTagsInput(note.tags.join(', '));
  };

  const handleNewNote = () => {
    const now = new Date().toISOString();
    const newNote: Note = {
      id: 'note_' + Date.now(),
      title: 'Untitled Note',
      content: '',
      tags: ['draft'],
      createdAt: now,
      updatedAt: now
    };
    setSelectedNote(newNote);
    setTitle(newNote.title);
    setContent('');
    setTagsInput('draft');
  };

  const handleSaveNote = async () => {
    if (!selectedNote) return;

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const updatedNote: Note = {
      ...selectedNote,
      title: title.trim() || 'Untitled Note',
      content,
      tags: parsedTags,
      updatedAt: new Date().toISOString()
    };

    await saveNote(updatedNote);
    await loadNotes(updatedNote.id);
  };

  const handleDeleteNote = async (id: string) => {
    if (confirm('Are you sure you want to delete this note from local storage?')) {
      await deleteNote(id);
      setSelectedNote(null);
      await loadNotes();
    }
  };

  const handleSummarizeNote = async () => {
    if (!content.trim() || !isAiConnected) return;
    setIsSummarizing(true);
    try {
      const summary = await summarizeDocAPI(content, title, activeModel);
      if (selectedNote) {
        const updated: Note = {
          ...selectedNote,
          summary,
          updatedAt: new Date().toISOString()
        };
        await saveNote(updated);
        setSelectedNote(updated);
      }
    } catch (err: any) {
      alert(`AI Summarization error: ${err.message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Collect all unique tags for chip filtering
  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags || [])));

  // Filtered notes
  const filteredNotes = notes.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag ? n.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  return (
    <div className="view-container">
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Smart Notes</h2>
          <p>Organize, search, and edit your notes locally. 100% stored in IndexedDB.</p>
        </div>
        <button className="btn btn-primary" onClick={handleNewNote}>
          + New Note
        </button>
      </div>

      <div className="notes-container">
        {/* Left Column: Note List & Search Filter */}
        <div className="notes-list-col">
          <input
            type="text"
            placeholder="Search notes by keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Tag Filter Chips */}
          {allTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '4px 0' }}>
              <span
                className="tag-chip"
                style={{
                  cursor: 'pointer',
                  background: selectedTag === null ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)',
                  color: '#FFFFFF'
                }}
                onClick={() => setSelectedTag(null)}
              >
                All ({notes.length})
              </span>
              {allTags.map((tag) => (
                <span
                  key={tag}
                  className="tag-chip"
                  style={{
                    cursor: 'pointer',
                    background: selectedTag === tag ? 'var(--accent-primary)' : undefined,
                    color: selectedTag === tag ? '#FFFFFF' : undefined
                  }}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Notes Scrollable Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 240px)' }}>
            {filteredNotes.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No notes found matching your filter.
              </div>
            ) : (
              filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className={`note-card ${selectedNote?.id === note.id ? 'active' : ''}`}
                  onClick={() => handleSelectNote(note)}
                >
                  <div className="note-card-title">{note.title || 'Untitled Note'}</div>
                  <div className="note-card-preview">
                    {note.content ? note.content.slice(0, 100) : '(Empty note)'}
                  </div>
                  <div>
                    {note.tags.map((t) => (
                      <span key={t} className="tag-chip">
                        #{t}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Note Editor & AI Assistant Panel */}
        <div className="notes-editor-col">
          {selectedNote ? (
            <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Note Title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ fontSize: '16px', fontWeight: 700 }}
                />
                <button className="btn btn-primary" onClick={handleSaveNote}>
                  Save
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDeleteNote(selectedNote.id)}
                  title="Delete note"
                >
                  Delete
                </button>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Tags (comma separated, e.g. study, ai, project)..."
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
              </div>

              <textarea
                style={{ flex: 1, minHeight: '260px', fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.6 }}
                placeholder="Write your note in Markdown or plain text here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />

              {/* AI Summary Section */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>AI Note Insights & Summary</span>
                  <button
                    className="btn btn-secondary"
                    onClick={handleSummarizeNote}
                    disabled={!isAiConnected || isSummarizing || !content.trim()}
                    title={isAiConnected ? "Generate summary using local Ollama" : "Start Ollama to use AI summarization"}
                  >
                    {isSummarizing ? 'Generating Summary...' : '⚡ Summarize with AI'}
                  </button>
                </div>

                {selectedNote.summary ? (
                  <div
                    style={{
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px solid rgba(99, 102, 241, 0.2)',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: '#E0E7FF',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {selectedNote.summary}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {isAiConnected
                      ? "Click 'Summarize with AI' to analyze and generate structured takeaways."
                      : "Local AI is offline. Notes are safely saved in your browser's IndexedDB."}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card-panel" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              Select a note on the left or create a new note to start writing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
