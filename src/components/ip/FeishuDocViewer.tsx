'use client';
import { useState, useEffect, useCallback } from 'react';

interface DocInfo {
  document_name: string;
  feishu_doc_url: string;
  document_id: string;
  obj_type: string;
  sort_order: number;
}

interface DocSectionMarkdown {
  heading: string;
  markdown: string;
  blockId: string;
}

interface Props {
  ipId: number;
  allDocs: DocInfo[];
  docUrl: string | null;
}

// Pure-function Markdown → HTML renderer (no external deps)
function renderMarkdownToHtml(md: string): string {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (before inline processing)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-100 rounded p-3 overflow-x-auto text-sm my-2"><code>$2</code></pre>');

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-3 border-gray-300" />');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-gray-300 pl-3 italic text-gray-600 my-2">$1</blockquote>');

  // Inline styles
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-600 underline">$1</a>');
  html = html.replace(/<u>(.+?)<\/u>/g, '<u>$1</u>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p class="my-1">');
  html = html.replace(/\n/g, '<br />');

  return '<p class="my-1">' + html + '</p>';
}

export default function FeishuDocViewer({ ipId, allDocs, docUrl }: Props) {
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [sections, setSections] = useState<DocSectionMarkdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-section edit state
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const activeDoc = allDocs.find(d => d.document_id === selectedDocId);
  const isSheet = activeDoc?.obj_type === 'sheet';

  const fetchContent = useCallback(async (documentId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = documentId ? `?document_id=${encodeURIComponent(documentId)}` : '';
      const res = await fetch(`/api/ips/${ipId}/feishu-doc${params}`);
      const data = await res.json();
      setSections(data.sectionsMarkdown || []);
      if (!data.docUrl) {
        setError('暂无文档内容');
      }
    } catch {
      setError('加载文档失败');
    } finally {
      setLoading(false);
    }
  }, [ipId]);

  // Set initial selected doc
  useEffect(() => {
    if (!selectedDocId && allDocs.length > 0) {
      setSelectedDocId(allDocs[0].document_id);
    }
  }, [allDocs, selectedDocId]);

  // Fetch content when selected doc changes
  useEffect(() => {
    if (selectedDocId) {
      fetchContent(selectedDocId);
    } else if (docUrl) {
      fetchContent();
    }
  }, [selectedDocId, docUrl, fetchContent]);

  const startEdit = (blockId: string, currentMarkdown: string) => {
    setEditingBlockId(blockId);
    setEditingContent(currentMarkdown);
  };

  const cancelEdit = () => {
    setEditingBlockId(null);
    setEditingContent('');
  };

  const saveEdit = async (blockId: string) => {
    setSaving(true);
    try {
      const body: Record<string, string> = {
        action: 'update_block',
        blockId,
        content: editingContent,
      };
      if (selectedDocId) body.document_id = selectedDocId;

      await fetch(`/api/ips/${ipId}/feishu-doc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setEditingBlockId(null);
      fetchContent(selectedDocId || undefined);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const syncFromFeishu = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const body: Record<string, string> = { direction: 'pull' };
      if (selectedDocId) body.document_id = selectedDocId;

      const res = await fetch(`/api/ips/${ipId}/feishu-doc/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setSyncMsg(`检测到 ${data.changesDetected} 处变更，已应用 ${data.changesApplied} 处`);
      fetchContent(selectedDocId || undefined);
    } catch {
      setSyncMsg('同步失败');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  };

  // Sheet doc placeholder
  if (isSheet && !loading) {
    return (
      <div className="border border-gray-200 rounded-lg">
        {allDocs.length > 0 && (
          <div className="flex gap-1 border-b border-gray-200 px-3 pt-3 overflow-x-auto">
            {allDocs.map(doc => (
              <button
                key={doc.document_id}
                onClick={() => setSelectedDocId(doc.document_id)}
                className={`px-3 py-1.5 text-sm rounded-t whitespace-nowrap transition-colors ${
                  selectedDocId === doc.document_id
                    ? 'bg-white text-blue-600 border border-b-white -mb-px font-medium'
                    : 'text-gray-500 hover:text-gray-700 bg-gray-50'
                }`}
              >
                {doc.obj_type === 'sheet' && (
                  <span className="inline-block w-2 h-2 rounded bg-green-500 mr-1" />
                )}
                {doc.document_name}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <h3 className="text-base font-medium text-gray-700 mb-1">
            {activeDoc?.document_name || '电子表格'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">表格内容暂不支持在系统内直接查看</p>
          <a
            href={activeDoc?.feishu_doc_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            在飞书中打开
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Doc tabs */}
      {allDocs.length > 0 && (
        <div className="flex gap-1 border-b border-gray-200 px-3 pt-3 overflow-x-auto">
          {allDocs.map(doc => (
            <button
              key={doc.document_id}
              onClick={() => {
                setEditingBlockId(null);
                setSelectedDocId(doc.document_id);
              }}
              className={`px-3 py-1.5 text-sm rounded-t whitespace-nowrap transition-colors ${
                selectedDocId === doc.document_id
                  ? 'bg-white text-blue-600 border border-b-white -mb-px font-medium'
                  : 'text-gray-500 hover:text-gray-700 bg-gray-50'
              }`}
            >
              {doc.obj_type === 'sheet' && (
                <span className="inline-block w-2 h-2 rounded bg-green-500 mr-1" />
              )}
              {doc.document_name}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          {activeDoc && (
            <span className="text-sm text-gray-600 font-medium">{activeDoc.document_name}</span>
          )}
          <a
            href={activeDoc?.feishu_doc_url || docUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:text-blue-700 inline-flex items-center gap-0.5"
          >
            在飞书打开
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncFromFeishu}
            disabled={syncing}
            className="px-3 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40"
          >
            {syncing ? '同步中...' : '同步'}
          </button>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div className="px-4 py-1.5 bg-blue-50 text-blue-700 text-xs border-b border-blue-100">
          {syncMsg}
        </div>
      )}

      {/* Content */}
      <div className="p-4 min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-2 text-sm text-gray-500">加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500">暂无文档内容</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => {
              const isEditing = editingBlockId === section.blockId;
              return (
                <div key={section.blockId} className="rounded-lg border border-gray-100 bg-white/50">
                  {/* Section header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50">
                    <h4 className="text-sm font-semibold text-gray-700">{section.heading}</h4>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => saveEdit(section.blockId)}
                          disabled={saving}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {saving ? '保存中...' : '保存'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-2.5 py-1 rounded text-xs text-gray-500 hover:bg-gray-100"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(section.blockId, section.markdown)}
                        className="px-2.5 py-1 rounded text-xs text-gray-500 hover:bg-gray-100"
                      >
                        编辑
                      </button>
                    )}
                  </div>

                  {/* Section content */}
                  <div className="px-3 py-2">
                    {isEditing ? (
                      <textarea
                        value={editingContent}
                        onChange={e => setEditingContent(e.target.value)}
                        className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded p-2.5 min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                        rows={4}
                      />
                    ) : (
                      <div
                        className="prose prose-sm max-w-none text-gray-700 text-sm"
                        dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(section.markdown) }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
