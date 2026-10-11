'use client';
import { useState, useEffect } from 'react';
import FeishuDocViewer from './FeishuDocViewer';

interface StageTask {
  id: number; stage_name: string; task_name: string; description: string;
  status: string; due_date: string; completed_at: string | null;
  completion_note: string; feishu_doc_url: string;
}

interface StageData {
  stage_name: string;
  completed_at: string | null;
  completed_by: number | null;
  tasks: StageTask[];
}

interface Props {
  ipId: number;
  productTypeId: number | null;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`;
}

function daysBetween(d1: string, d2: string): number {
  if (!d1 || !d2) return 0;
  const a = new Date(d1 + 'T00:00:00');
  const b = new Date(d2 + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export default function StageTimeline({ ipId, productTypeId }: Props) {
  const [stages, setStages] = useState<StageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  // Track which stages have their task list expanded
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  // Doc content state
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [allDocs, setAllDocs] = useState<Array<{ document_name: string; feishu_doc_url: string; document_id: string; obj_type: string; sort_order: number }>>([]);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [docWarning, setDocWarning] = useState<string | null>(null);

  const fetchDoc = () => {
    fetch(`/api/ips/${ipId}/feishu-doc`)
      .then(r => r.json())
      .then(d => {
        setDocUrl(d.docUrl || null);
        setAllDocs(Array.isArray(d.docs) ? d.docs : []);
      })
      .catch(() => {});
  };

  useEffect(() => { fetchStages(); fetchDoc(); }, [ipId]);

  const createDoc = async () => {
    setCreatingDoc(true);
    try {
      const res = await fetch(`/api/ips/${ipId}/feishu-doc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_doc' }),
      });
      const data = await res.json();
      if (data.docUrl) {
        fetchDoc();
        if (data.warning) setDocWarning(data.warning);
      }
    } catch {} finally { setCreatingDoc(false); }
  };

  const fetchStages = () => {
    fetch(`/api/ips/${ipId}/stage-progress`)
      .then(r => r.json())
      .then(d => setStages(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const toggleStage = async (stageName: string, currentlyCompleted: boolean) => {
    setToggling(stageName);
    try {
      await fetch(`/api/ips/${ipId}/stage-progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_name: stageName, completed: !currentlyCompleted }),
      });
      fetchStages();
    } catch {} finally { setToggling(null); }
  };

  const toggleExpand = (stageName: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageName)) next.delete(stageName); else next.add(stageName);
      return next;
    });
  };

  if (loading) return <div className="text-center py-6 text-gray-500 text-[12px]">加载中...</div>;

  const completedCount = stages.filter(s => s.completed_at).length;
  const progress = stages.length > 0 ? Math.round((completedCount / stages.length) * 100) : 0;

  // Calculate elapsed time from first to last completed stage
  const completedStages = stages.filter(s => s.completed_at);
  let elapsedText = '';
  if (completedStages.length >= 2) {
    const firstDate = completedStages[0].completed_at!;
    const lastDate = completedStages[completedStages.length - 1].completed_at!;
    const days = daysBetween(firstDate, lastDate);
    elapsedText = `${completedStages.length} 个阶段已完成，累计 ${days} 天`;
  } else if (completedStages.length === 1) {
    elapsedText = `第 1 个阶段已完成`;
  }

  return (
    <div className="space-y-3">
      {/* Progress summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-gray-700">交付阶段进度</span>
          <span className={`text-[18px] font-bold font-mono ${progress >= 80 ? 'text-emerald-600' : progress >= 40 ? 'text-amber-500' : 'text-gray-400'}`}>
            {progress}%
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span>{completedCount}/{stages.length} 个阶段已完成</span>
          {elapsedText && <span className="text-emerald-600">{elapsedText}</span>}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-black/[0.04] overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${
          progress >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
          progress >= 40 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
          'bg-gradient-to-r from-gray-300 to-gray-400'
        }`} style={{ width: `${progress}%` }} />
      </div>

      {/* Stage timeline */}
      <div className="relative">
        {stages.map((stage, index) => {
          const isCompleted = !!stage.completed_at;
          const isLast = index === stages.length - 1;
          const isToggling = toggling === stage.stage_name;
          const taskCount = stage.tasks.length;
          const completedTasks = stage.tasks.filter(t => t.status === 'completed').length;
          const isExpanded = expandedStages.has(stage.stage_name);

          return (
            <div key={stage.stage_name} className="flex gap-3">
              {/* Timeline indicator */}
              <div className="flex flex-col items-center flex-shrink-0">
                <button
                  onClick={() => toggleStage(stage.stage_name, isCompleted)}
                  disabled={isToggling}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-500 shadow-sm shadow-emerald-500/20'
                      : 'border-gray-300 hover:border-emerald-400 bg-white'
                  }`}
                >
                  {isToggling ? (
                    <svg className="w-3 h-3 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : isCompleted ? (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className={`w-2 h-2 rounded-full ${isToggling ? 'bg-emerald-300' : 'bg-transparent'}`} />
                  )}
                </button>
                {!isLast && (
                  <div className={`w-0.5 h-full min-h-[24px] mt-1 ${isCompleted ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                )}
              </div>

              {/* Stage content */}
              <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
                <div className={`p-3 rounded-xl border transition-colors ${
                  isCompleted ? 'bg-emerald-50/30 border-emerald-200' : 'bg-white/50 border-gray-100'
                }`}>
                  <div className="flex items-center justify-between">
                    <button onClick={() => toggleExpand(stage.stage_name)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <h4 className={`text-[13px] font-semibold ${isCompleted ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {stage.stage_name}
                      </h4>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">
                        {completedTasks}/{taskCount} 任务
                      </span>
                      <svg className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isCompleted && (
                      <span className="text-[11px] text-emerald-600 font-medium flex-shrink-0 ml-2">
                        {formatDate(stage.completed_at!)}
                      </span>
                    )}
                  </div>

                  {/* Expanded task list */}
                  {isExpanded && stage.tasks.length > 0 && (
                    <div className="mt-2 space-y-1.5 pl-1">
                      {stage.tasks.map(task => {
                        const isTaskDone = task.status === 'completed';
                        return (
                          <div key={task.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/60">
                            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                              isTaskDone ? 'bg-emerald-400 border-emerald-400' : 'border-gray-300'
                            }`}>
                              {isTaskDone && (
                                <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <span className={`text-[12px] flex-1 ${isTaskDone ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                              {task.task_name}
                            </span>
                            {task.feishu_doc_url && (
                              <a href={task.feishu_doc_url} target="_blank" rel="noopener noreferrer"
                                 onClick={e => e.stopPropagation()}
                                 className="text-blue-400 hover:text-blue-600 flex-shrink-0">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Time between stages */}
                  {isCompleted && index > 0 && stages[index - 1].completed_at && (
                    <p className="text-[10px] text-gray-400 mt-2 pl-1">
                      距上一阶段完成：{daysBetween(stages[index - 1].completed_at!, stage.completed_at!)} 天
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Feishu Doc Section */}
      <div className="border-t border-gray-200 pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-gray-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            交付文档
          </h3>
        </div>

        {!docUrl && allDocs.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-[12px] text-gray-400 mb-3">尚未创建飞书交付文档</p>
            {docWarning && (
              <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 inline-block">
                {docWarning}
              </p>
            )}
            <button onClick={createDoc} disabled={creatingDoc}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-md transition-all disabled:opacity-50">
              {creatingDoc ? '创建中...' : '创建飞书文档'}
            </button>
          </div>
        ) : (
          <FeishuDocViewer
            ipId={ipId}
            allDocs={allDocs}
            docUrl={docUrl}
          />
        )}
      </div>
    </div>
  );
}
