import React, { useState, useEffect, useRef } from 'react';
import { LocalDocument, getAllDocuments, saveDocument, deleteDocument } from '../db/indexedDb';
import { uploadAndExtractDoc, summarizeDocAPI, queryDocAPI } from '../services/api';

interface DocumentsViewProps {
  isAiConnected: boolean;
  activeModel: string;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({ isAiConnected, activeModel }) => {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<LocalDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [userQuestion, setUserQuestion] = useState('');
  const [groundedAnswer, setGroundedAnswer] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocs();
  }, []);

  const loadDocs = async (selectId?: string) => {
    const list = await getAllDocuments();
    setDocuments(list);
    if (selectId) {
      const found = list.find((d) => d.id === selectId);
      if (found) setSelectedDoc(found);
    } else if (list.length > 0 && !selectedDoc) {
      setSelectedDoc(list[0]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setErrorMsg(null);
    setIsUploading(true);

    try {
      // Send to local backend for extraction
      const extracted = await uploadAndExtractDoc(file);
      const newDoc: LocalDocument = {
        id: 'doc_' + Date.now(),
        filename: extracted.filename,
        charCount: extracted.char_count,
        estimatedTokens: extracted.estimated_tokens,
        pagesCount: extracted.pages_count,
        text: extracted.text,
        createdAt: new Date().toISOString()
      };
      await saveDocument(newDoc);
      await loadDocs(newDoc.id);
      setSelectedDoc(newDoc);
      setGroundedAnswer(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSummarize = async () => {
    if (!selectedDoc || !isAiConnected) return;
    setIsSummarizing(true);
    setErrorMsg(null);
    try {
      const summary = await summarizeDocAPI(selectedDoc.text, selectedDoc.filename, activeModel);
      const updated: LocalDocument = {
        ...selectedDoc,
        summary
      };
      await saveDocument(updated);
      setSelectedDoc(updated);
      await loadDocs(updated.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Summarization failed');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGroundedQA = async () => {
    const q = userQuestion.trim();
    if (!selectedDoc || !q || !isAiConnected) return;
    setIsAnswering(true);
    setErrorMsg(null);
    setGroundedAnswer(null);

    try {
      const answer = await queryDocAPI(selectedDoc.text, q, selectedDoc.filename, activeModel);
      setGroundedAnswer(answer);
    } catch (err: any) {
      setErrorMsg(err.message || 'Grounded Q&A failed');
    } finally {
      setIsAnswering(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this local document and its indexed text?')) {
      await deleteDocument(id);
      setSelectedDoc(null);
      setGroundedAnswer(null);
      await loadDocs();
    }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <h2>Local Document Assistant</h2>
        <p>Ground AI answers and summaries in your local PDF, Markdown, and text files. Never sent to the cloud.</p>
      </div>

      {errorMsg && (
        <div style={{ padding: '12px 16px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--rose-accent)', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', flex: 1 }}>
        {/* Left Column: Upload Dropzone & Document List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Upload Drop Zone */}
          <div
            className="dropzone"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.txt,.md,.markdown,.csv,.json,.py,.js"
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📂</div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#FFFFFF', marginBottom: '4px' }}>
              {isUploading ? 'Extracting text locally...' : 'Select or Drop Document'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Supports PDF, TXT, MD (Max 10MB)
            </div>
          </div>

          {/* Stored Documents List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Saved Documents ({documents.length})
            </div>

            {documents.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No local documents uploaded yet.
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`note-card ${selectedDoc?.id === doc.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedDoc(doc);
                    setGroundedAnswer(null);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span>📄</span>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#FFFFFF', wordBreak: 'break-all' }}>
                      {doc.filename}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {doc.charCount.toLocaleString()} chars • ~{doc.estimatedTokens.toLocaleString()} tokens
                    {doc.pagesCount > 1 && ` • ${doc.pagesCount} pages`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Grounded QA & Document Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedDoc ? (
            <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Document Header & Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📄</span> {selectedDoc.filename}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Extracted text stored locally in IndexedDB • Zero external transmission
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={handleSummarize}
                    disabled={!isAiConnected || isSummarizing}
                    title={isAiConnected ? "Summarize document locally with Ollama" : "Start Ollama to summarize"}
                  >
                    {isSummarizing ? 'Summarizing...' : '⚡ Summarize'}
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(selectedDoc.id)}
                    title="Remove document from local storage"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Document Summary (if generated) */}
              {selectedDoc.summary && (
                <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--cyan-accent)', marginBottom: '6px' }}>
                    DOCUMENT SUMMARY
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#E0E7FF', whiteSpace: 'pre-wrap' }}>
                    {selectedDoc.summary}
                  </div>
                </div>
              )}

              {/* Grounded Q&A Section */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                <h4 style={{ fontSize: '14px', color: '#FFFFFF', marginBottom: '8px' }}>
                  Ask Questions Grounded in this Document
                </h4>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    placeholder={`Ask anything about "${selectedDoc.filename}"...`}
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleGroundedQA();
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleGroundedQA}
                    disabled={!userQuestion.trim() || !isAiConnected || isAnswering}
                  >
                    {isAnswering ? 'Searching...' : 'Ask AI'}
                  </button>
                </div>

                {groundedAnswer && (
                  <div style={{ marginTop: '14px', padding: '14px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--emerald-accent)', fontWeight: 700, marginBottom: '6px' }}>
                      GROUNDED ANSWER (Source: {selectedDoc.filename})
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#F3F4F6', whiteSpace: 'pre-wrap' }}>
                      {groundedAnswer}
                    </div>
                  </div>
                )}
              </div>

              {/* Extracted Text Preview Box */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Extracted Local Text Preview ({selectedDoc.charCount.toLocaleString()} characters)
                </div>
                <div
                  style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    color: '#9CA3AF'
                  }}
                >
                  {selectedDoc.text}
                </div>
              </div>
            </div>
          ) : (
            <div className="card-panel" style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
              Select a document from the left or upload a PDF/text file to start.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
