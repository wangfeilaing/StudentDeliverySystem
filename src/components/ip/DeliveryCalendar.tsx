'use client';
import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import StageTimeline from '@/components/ip/StageTimeline';

interface DeliveryTask {
  id: number; client_id: number; template_id: number | null;
  stage_name: string; task_name: string; description: string;
  status: string; due_date: string; completed_at: string | null;
  completed_by: number | null; owner_id: number | null;
  sort_order: number; is_required: number;
  completion_note: string; copy_text: string; created_at: string;
  feishu_doc_url: string;
}

interface Props {
  ipId: number;
  productTypeId: number | null;
  courseStartDate: string;
  batchNumber?: string;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function formatMonthYear(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function sameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function isLesson(taskName: string): boolean {
  return /^第\d+讲/.test(taskName);
}
function isAssignment(taskName: string): boolean {
  return taskName.startsWith('实操作业');
}
function isCeremony(taskName: string): boolean {
  return taskName.includes('结营');
}

function taskTypeIcon(taskName: string): string {
  if (isCeremony(taskName)) return '🎓';
  if (isAssignment(taskName)) return '📝';
  return '📖';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`;
}

function lessonNum(taskName: string): string {
  const m = taskName.match(/^(第\d+讲)/);
  return m ? m[1] : '';
}

function shortTitle(taskName: string): string {
  return taskName.replace(/^第\d+讲[：:]\s*/, '').replace(/^实操作业[：:]\s*/, '');
}

export default function DeliveryCalendar({ ipId, productTypeId, courseStartDate, batchNumber }: Props) {
  const [tasks, setTasks] = useState<DeliveryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => {
    if (courseStartDate) return new Date(courseStartDate + 'T00:00:00');
    return new Date();
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Completion modal
  const [completeTask, setCompleteTask] = useState<DeliveryTask | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const is6980 = productTypeId === 1;

  // Batch completion state
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // Feishu sync state
  const [syncToFeishu, setSyncToFeishu] = useState(true);
  const [batchSyncToFeishu, setBatchSyncToFeishu] = useState(true);

  // Copy state — per-section tracking: "taskId-script" | "taskId-replay"
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  // Generate replay section text from lesson task_name
  function getReplayText(taskName: string): string {
    const m = taskName.match(/^(第\d+讲)[：:]\s*(.+)/);
    if (!m) return '';
    return `${m[1]}｜${m[2]}\n回放链接：`;
  }

  const fetchTasks = () => {
    fetch(`/api/ips/${ipId}/delivery-tasks`)
      .then(r => r.json())
      .then(d => { setTasks(Array.isArray(d) ? d : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTasks(); }, [ipId]);

  // Group tasks by due_date
  const tasksByDate = new Map<string, DeliveryTask[]>();
  tasks.forEach(t => {
    if (!t.due_date) return;
    if (!tasksByDate.has(t.due_date)) tasksByDate.set(t.due_date, []);
    tasksByDate.get(t.due_date)!.push(t);
  });

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calendar grid
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const totalCells = startPad + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  const endPad = rows * 7 - totalCells;

  const prevMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
    setSelectedDate(null);
  };
  const nextMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
    setSelectedDate(null);
  };

  const selectedTasks = selectedDate ? (tasksByDate.get(selectedDate) || []) : [];

  const handleCheck = (task: DeliveryTask) => {
    if (task.status === 'completed') {
      fetch(`/api/ips/${ipId}/delivery-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'not_started', task_name: task.task_name }),
      }).then(() => fetchTasks());
    } else {
      setCompleteTask(task);
      setCompletionNote('');
      setSyncToFeishu(!!task.feishu_doc_url);
    }
  };

  const handleCompleteSubmit = async () => {
    if (!completeTask) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/ips/${ipId}/delivery-tasks/${completeTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', task_name: completeTask.task_name, completion_note: completionNote, sync_to_feishu: syncToFeishu, feishu_doc_url: completeTask.feishu_doc_url }),
      });
      if (!res.ok) throw new Error('操作失败');
      setCompleteTask(null);
      fetchTasks();
    } catch {} finally { setSubmitting(false); }
  };

  // ---- Batch completion handlers ----
  const toggleSelect = (taskId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  const selectAllIncomplete = () => {
    const all = tasks.filter(t => t.status !== 'completed').map(t => t.id);
    setSelectedIds(new Set(all));
  };

  const selectOverdue = () => {
    const overdue = tasks.filter(t =>
      t.status !== 'completed' && t.status !== 'cancelled' &&
      new Date(t.due_date + 'T00:00:00') < today
    ).map(t => t.id);
    setSelectedIds(new Set(overdue));
  };

  const handleBatchComplete = async () => {
    if (selectedIds.size === 0) return;
    setBatchSubmitting(true);
    try {
      const selectedTasks = tasks.filter(t => selectedIds.has(t.id));
      const promises = selectedTasks.map(task =>
        fetch(`/api/ips/${ipId}/delivery-tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'completed',
            task_name: task.task_name,
            completion_note: batchNote,
            sync_to_feishu: batchSyncToFeishu,
            feishu_doc_url: task.feishu_doc_url,
          }),
        }).then(r => { if (!r.ok) throw new Error('Failed'); })
      );
      await Promise.all(promises);
      setSelectedIds(new Set());
      setBatchMode(false);
      setShowBatchModal(false);
      setBatchNote('');
      fetchTasks();
    } catch {} finally { setBatchSubmitting(false); }
  };

  if (loading) return <div className="text-center py-6 text-gray-500 text-[12px]">加载中...</div>;

  // Non-6980: show stage timeline
  if (!is6980) {
    return <StageTimeline ipId={ipId} productTypeId={productTypeId} />;
  }

  return (
    <div>
      {/* Progress summary */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-gray-700">21 天确定性获客训练营 课程交付日历</span>
          {batchNumber && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 border border-emerald-400/20 font-medium">{batchNumber}</span>
          )}
          <span className={`text-[18px] font-bold font-mono ${progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
            {progress}%
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span>{completedCount}/{tasks.length} 节已完成</span>
          {courseStartDate && (
            <span className="text-gray-400">开课：{courseStartDate}</span>
          )}
          <button
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              batchMode
                ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-400/25'
                : 'bg-black/5 text-gray-500 border border-transparent hover:bg-black/10'
            }`}
          >
            {batchMode ? '退出批量' : '批量核销'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-black/[0.04] overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all duration-500 ${
          progress >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
          progress >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
          'bg-gradient-to-r from-red-400 to-red-500'
        }`} style={{ width: `${progress}%` }} />
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth}
          className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-gray-500 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-gray-700">{formatMonthYear(viewMonth)}</span>
        <button onClick={nextMonth}
          className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-gray-500 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Legend — compact */}
      <div className="flex items-center gap-4 mb-2 text-[10px] text-gray-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> 已完成</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> 待上课</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> 已逾期</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-amber-500" /> 实操作业</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-purple-500" /> 结营</span>
      </div>

      {/* Calendar grid */}
      <div className="glass-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-black/[0.04]">
          {WEEKDAYS.map(w => (
            <div key={w} className="py-2 pl-1.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-start-${i}`} className="h-32 border-r border-b border-black/[0.02] bg-gray-50/30" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayTasks = tasksByDate.get(dateStr) || [];
            const isToday = sameDay(date, today);
            const isSelected = selectedDate === dateStr;

            if (dayTasks.length === 0) {
              // Empty day
              return (
                <div key={day}
                  className={`h-32 border-r border-b border-black/[0.02] flex items-start justify-start p-1.5 bg-gray-50/20
                    ${isToday ? 'ring-1 ring-inset ring-emerald-400/30' : ''}
                  `}
                >
                  <span className={`text-[12px] font-medium ${isToday ? 'text-emerald-700 font-bold' : 'text-gray-400'}`}>
                    {day}
                  </span>
                </div>
              );
            }

            // Has tasks — show content
            const task = dayTasks[0]; // main task for display
            const isCompleted = task.status === 'completed';
            const isLes = isLesson(task.task_name);
            const isAsgn = isAssignment(task.task_name);
            const isCere = isCeremony(task.task_name);
            const isOverdue = !isCompleted && task.status !== 'cancelled' && new Date(task.due_date + 'T00:00:00') < today;
            const hasOther = dayTasks.length > 1;

            // Left border + background color
            let borderColor = 'border-l-blue-400 bg-blue-50/15';
            let bgHover = 'hover:bg-blue-50/30';
            if (isCompleted) { borderColor = 'border-l-emerald-400 bg-emerald-50/20'; bgHover = 'hover:bg-emerald-50/40'; }
            else if (isCere) { borderColor = 'border-l-purple-400 bg-purple-50/15'; bgHover = 'hover:bg-purple-50/30'; }
            else if (isAsgn) { borderColor = 'border-l-amber-400 bg-amber-50/15'; bgHover = 'hover:bg-amber-50/30'; }
            else if (isOverdue) { borderColor = 'border-l-red-400 bg-red-50/15'; bgHover = 'hover:bg-red-50/30'; }

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`h-32 border-r border-b border-l-4 border-black/[0.02] ${borderColor} ${bgHover}
                  flex flex-col items-stretch p-1.5 transition-colors relative
                  ${isSelected ? 'ring-2 ring-inset ring-emerald-400/30' : ''}
                  ${isToday ? 'shadow-[inset_0_0_0_1px_rgba(16,185,129,0.3)]' : ''}
                `}
              >
                {/* Day number — top left */}
                <span className={`text-[11px] font-semibold ${isToday ? 'text-emerald-700 font-bold' : 'text-gray-400'}`}>
                  {day}
                </span>

                {/* Task icon + label */}
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[13px]">{taskTypeIcon(task.task_name)}</span>
                  {isLes && (
                    <span className={`text-[12px] font-bold leading-tight ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {lessonNum(task.task_name)}
                    </span>
                  )}
                  {isAsgn && (
                    <span className={`text-[11px] font-semibold leading-tight ${isCompleted ? 'text-gray-400 line-through' : 'text-amber-700'}`}>
                      实操作业
                    </span>
                  )}
                  {isCere && (
                    <span className={`text-[11px] font-semibold leading-tight ${isCompleted ? 'text-gray-400 line-through' : 'text-purple-700'}`}>
                      结营仪式
                    </span>
                  )}
                </div>

                {/* Title — for all types */}
                <p className={`text-[11px] leading-snug mt-1 ${isCompleted ? 'text-gray-400 line-through' : isAsgn ? 'text-amber-600' : isCere ? 'text-purple-600' : 'text-gray-600'}`}>
                  {shortTitle(task.task_name)}
                </p>

                {/* Status badge */}
                <div className="mt-auto">
                  {isCompleted ? (
                    <span className="text-[9px] px-1 py-px rounded bg-emerald-100 text-emerald-600">已完成</span>
                  ) : isOverdue ? (
                    <span className="text-[9px] px-1 py-px rounded bg-red-100 text-red-600">已逾期</span>
                  ) : (
                    <span className="text-[9px] px-1 py-px rounded bg-blue-50 text-blue-500">待上课</span>
                  )}
                  {hasOther && (
                    <span className="text-[9px] text-gray-400 ml-1">+{dayTasks.length - 1}</span>
                  )}
                </div>
              </button>
            );
          })}
          {Array.from({ length: endPad }).map((_, i) => (
            <div key={`pad-end-${i}`} className="h-32 border-r border-b border-black/[0.02] bg-gray-50/30" />
          ))}
        </div>
      </div>

      {/* Selected date details — only when not in batch mode */}
      {!batchMode && selectedDate && selectedTasks.length > 0 && (
        <div className="mt-3 space-y-2">
          <h4 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {selectedDate}
            <span className="text-[10px] text-gray-400 font-normal">
              {['周日','周一','周二','周三','周四','周五','周六'][new Date(selectedDate + 'T00:00:00').getDay()]}
            </span>
          </h4>
          {selectedTasks.map(task => {
            const isCompleted = task.status === 'completed';
            const isLes = isLesson(task.task_name);
            const isAsgn = isAssignment(task.task_name);
            const isCere = isCeremony(task.task_name);
            const isOverdue = !isCompleted && task.status !== 'cancelled' && new Date(task.due_date + 'T00:00:00') < today;

            let borderColor = 'border-l-blue-400';
            if (isCompleted) borderColor = 'border-l-emerald-400';
            else if (isCere) borderColor = 'border-l-purple-400';
            else if (isAsgn) borderColor = 'border-l-amber-400';
            else if (isOverdue) borderColor = 'border-l-red-400';

            return (
              <div key={task.id}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border-l-3 ${borderColor} ${
                  isCompleted ? 'bg-emerald-50/30' : isOverdue ? 'bg-red-50/20' : 'bg-white/50'
                }`}
              >
                <button
                  onClick={() => handleCheck(task)}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-500'
                      : isOverdue ? 'border-red-300 hover:border-red-400' : 'border-gray-300 hover:border-emerald-400'
                  }`}
                >
                  {isCompleted && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className="text-[14px] flex-shrink-0">{taskTypeIcon(task.task_name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[12px] font-medium ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {isLes ? task.task_name.replace(/^第\d+讲[：:]\s*/, '') : task.task_name}
                    </span>
                    {task.feishu_doc_url && (
                      <a href={task.feishu_doc_url} target="_blank" rel="noopener noreferrer"
                         onClick={e => e.stopPropagation()}
                         className="inline-flex items-center text-blue-500 hover:text-blue-600"
                         title="打开飞书文档">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                    {isCompleted ? (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-600 border border-emerald-200">已完成</span>
                    ) : isOverdue ? (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">已逾期</span>
                    ) : (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">待上课</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                    <span>{task.stage_name}</span>
                    <span>19:30</span>
                    {task.completion_note && <span className="text-emerald-600">备注：{task.completion_note}</span>}
                  </div>
                  {isLes && task.copy_text && (
                    <div className="mt-2 space-y-2">
                      {/* 开课话术 */}
                      <div className="relative">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-400 font-medium">开课话术</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(`${task.id}-script`, task.copy_text); }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-all bg-emerald-500/10 text-emerald-600 border border-emerald-400/20 hover:bg-emerald-500/20"
                          >
                            {copiedKey === `${task.id}-script` ? '已复制' : '复制话术'}
                          </button>
                        </div>
                        <pre className="text-[10px] text-gray-600 bg-slate-50 rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed border border-slate-100 max-h-[160px] overflow-y-auto">{task.copy_text}</pre>
                      </div>
                      {/* 回放信息 */}
                      {getReplayText(task.task_name) && (
                        <div className="relative">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-gray-400 font-medium">回放信息</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopy(`${task.id}-replay`, getReplayText(task.task_name)); }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-all bg-blue-500/10 text-blue-600 border border-blue-400/20 hover:bg-blue-500/20"
                            >
                              {copiedKey === `${task.id}-replay` ? '已复制' : '复制回放信息'}
                            </button>
                          </div>
                          <pre className="text-[10px] text-gray-600 bg-blue-50/50 rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed border border-blue-100 max-h-[120px] overflow-y-auto">{getReplayText(task.task_name)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Batch mode task list */}
      {batchMode && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              选择要批量核销的任务
              {selectedIds.size > 0 && <span className="text-[10px] text-emerald-600 font-normal">（已选 {selectedIds.size} 个）</span>}
            </h4>
            <div className="flex items-center gap-1.5">
              <button onClick={selectAllIncomplete}
                className="px-2 py-1 text-[10px] rounded-md bg-black/5 text-gray-500 hover:bg-black/10 transition-colors">
                全选未完成
              </button>
              <button onClick={selectOverdue}
                className="px-2 py-1 text-[10px] rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200">
                仅选逾期
              </button>
              {selectedIds.size > 0 && (
                <button onClick={() => setSelectedIds(new Set())}
                  className="px-2 py-1 text-[10px] rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                  清空选择
                </button>
              )}
            </div>
          </div>

          {/* Task checkboxes */}
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {tasks.filter(t => t.status !== 'completed').length === 0 ? (
              <p className="text-center py-6 text-[12px] text-gray-400">所有任务已完成</p>
            ) : (
              tasks.filter(t => t.status !== 'completed').map(task => {
                const isOverdue = task.status !== 'cancelled' && new Date(task.due_date + 'T00:00:00') < today;
                const checked = selectedIds.has(task.id);

                let rowBg = 'bg-white/50';
                if (checked) rowBg = 'bg-emerald-50/40';
                else if (isOverdue) rowBg = 'bg-red-50/15';

                return (
                  <label key={task.id}
                    className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors hover:bg-black/[0.02] ${rowBg}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(task.id)}
                      className="w-4 h-4 rounded border-2 border-gray-300 text-emerald-500 focus:ring-emerald-400 flex-shrink-0"
                    />
                    <span className="text-[14px] flex-shrink-0">{taskTypeIcon(task.task_name)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-medium text-gray-800">
                          {task.task_name}
                        </span>
                        {isOverdue ? (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">已逾期</span>
                        ) : (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">待上课</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                        <span>{task.stage_name}</span>
                        <span>{task.due_date}</span>
                        <span>19:30</span>
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {/* Batch action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl">
              <span className="text-[12px] text-emerald-700 font-medium">
                已选择 {selectedIds.size} 个任务，将统一标记为「已完成」
              </span>
              <Button size="sm" onClick={() => { setBatchNote(''); setShowBatchModal(true); }}>
                批量核销
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Single completion Modal */}
      <Modal open={!!completeTask} onClose={() => setCompleteTask(null)} title="完成核销" size="sm">
        {completeTask && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200">
              <p className="text-[13px] font-semibold text-gray-700">{completeTask.task_name}</p>
              {completeTask.description && <p className="text-[12px] text-gray-500 mt-1">{completeTask.description}</p>}
              {completeTask.due_date && (
                <p className="text-[11px] text-gray-400 mt-1">
                  上课日期：{formatDate(completeTask.due_date)} 19:30
                </p>
              )}
              {isLesson(completeTask.task_name) && completeTask.copy_text && (
                <div className="mt-2 space-y-2">
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400 font-medium">开课话术</span>
                      <button
                        onClick={() => handleCopy(`${completeTask.id}-script`, completeTask.copy_text)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-all bg-emerald-500/10 text-emerald-600 border border-emerald-400/20 hover:bg-emerald-500/20"
                      >
                        {copiedKey === `${completeTask.id}-script` ? '已复制' : '复制话术'}
                      </button>
                    </div>
                    <pre className="text-[10px] text-gray-600 bg-white rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed border border-emerald-100 max-h-[120px] overflow-y-auto">{completeTask.copy_text}</pre>
                  </div>
                  {getReplayText(completeTask.task_name) && (
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-400 font-medium">回放信息</span>
                        <button
                          onClick={() => handleCopy(`${completeTask.id}-replay`, getReplayText(completeTask.task_name))}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-all bg-blue-500/10 text-blue-600 border border-blue-400/20 hover:bg-blue-500/20"
                        >
                          {copiedKey === `${completeTask.id}-replay` ? '已复制' : '复制回放信息'}
                        </button>
                      </div>
                      <pre className="text-[10px] text-gray-600 bg-blue-50/50 rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed border border-blue-100 max-h-[100px] overflow-y-auto">{getReplayText(completeTask.task_name)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
            {completeTask.feishu_doc_url && (
              <>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50/30 border border-blue-100">
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <a href={completeTask.feishu_doc_url} target="_blank" rel="noopener noreferrer"
                     className="text-[12px] text-blue-600 hover:underline truncate"
                     onClick={e => e.stopPropagation()}>
                    打开飞书文档
                  </a>
                </div>
                <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={syncToFeishu}
                    onChange={e => setSyncToFeishu(e.target.checked)}
                    className="rounded accent-emerald-500" />
                  同步完成记录到飞书文档
                </label>
              </>
            )}
            <Textarea
              label="交付说明 *"
              value={completionNote}
              onChange={e => setCompletionNote(e.target.value)}
              placeholder="请填写交付内容、完成情况等..."
              rows={3}
            />
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setCompleteTask(null)}>取消</Button>
              <Button onClick={handleCompleteSubmit} disabled={submitting || !completionNote.trim()}>
                {submitting ? '提交中...' : '确认核销'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Batch completion Modal */}
      <Modal open={showBatchModal} onClose={() => setShowBatchModal(false)} title="批量核销" size="sm">
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200">
            <p className="text-[13px] font-semibold text-gray-700">批量核销 {selectedIds.size} 个任务</p>
            <div className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
              {tasks.filter(t => selectedIds.has(t.id)).map(t => (
                <p key={t.id} className="text-[11px] text-gray-500 truncate">
                  {taskTypeIcon(t.task_name)} {t.task_name}
                </p>
              ))}
            </div>
          </div>
          <Textarea
            label="交付说明 *"
            value={batchNote}
            onChange={e => setBatchNote(e.target.value)}
            placeholder="请填写统一的交付内容、完成情况等..."
            rows={3}
          />
          {tasks.filter(t => selectedIds.has(t.id)).some(t => t.feishu_doc_url) && (
            <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={batchSyncToFeishu}
                onChange={e => setBatchSyncToFeishu(e.target.checked)}
                className="rounded accent-emerald-500" />
              同步完成记录到对应的飞书文档
            </label>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowBatchModal(false)}>取消</Button>
            <Button onClick={handleBatchComplete} disabled={batchSubmitting || !batchNote.trim()}>
              {batchSubmitting ? '提交中...' : `确认核销 ${selectedIds.size} 个任务`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
