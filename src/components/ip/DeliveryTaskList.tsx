'use client';
import { useState, useEffect, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';

interface DeliveryTask {
  id: number; client_id: number; template_id: number | null;
  stage_name: string; task_name: string; description: string;
  status: string; due_date: string; completed_at: string | null;
  completed_by: number | null; owner_id: number | null;
  sort_order: number; is_required: number;
  completion_note: string; created_at: string;
}

interface DeliveryLog {
  id: number; client_id: number; task_id: number | null;
  operator_id: number | null; operator_name: string;
  action_type: string; content: string;
  old_status: string; new_status: string;
  attachments: string; created_at: string;
}

interface TaskAttachment {
  id: number; file_name: string; file_path: string;
  file_type: string; file_size: number; created_at: string;
}

interface Props {
  ipId: number;
  productTypeId: number | null;
  courseStartDate: string;
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  not_started: { label: '未开始', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  in_progress: { label: '进行中', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  completed: { label: '已完成', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  overdue: { label: '已延期', cls: 'bg-red-50 text-red-500 border-red-200' },
  cancelled: { label: '已取消', cls: 'bg-slate-50 text-gray-400 border-slate-200' },
};

const actionLabels: Record<string, string> = {
  create_client: '创建客户', create_task: '创建任务', update_task: '更新任务',
  complete_task: '完成任务', reopen_task: '重新打开', upload_attachment: '上传附件',
  add_note: '添加备注', delete_task: '删除任务',
};

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`;
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

export default function DeliveryTaskList({ ipId, productTypeId, courseStartDate }: Props) {
  const [tasks, setTasks] = useState<DeliveryTask[]>([]);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'logs'>('tasks');
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  // Complete task modal
  const [completeTask, setCompleteTask] = useState<DeliveryTask | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [completeFiles, setCompleteFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New task modal
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskStage, setNewTaskStage] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskSaving, setNewTaskSaving] = useState(false);

  // Attachment preview
  const [attachments, setAttachments] = useState<Map<number, TaskAttachment[]>>(new Map());
  const [loadingAttach, setLoadingAttach] = useState<Set<number>>(new Set());

  const is6980 = productTypeId === 1;
  const effectiveStartDate = courseStartDate || new Date().toISOString().split('T')[0];

  const fetchTasks = () => {
    fetch(`/api/ips/${ipId}/delivery-tasks`)
      .then(r => r.json()).then(d => setTasks(Array.isArray(d) ? d : [])).catch(() => {});
  };

  const fetchLogs = () => {
    fetch(`/api/ips/${ipId}/delivery-logs`)
      .then(r => r.json()).then(d => setLogs(Array.isArray(d) ? d : [])).catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/ips/${ipId}/delivery-tasks`).then(r => r.json()),
      fetch(`/api/ips/${ipId}/delivery-logs`).then(r => r.json()),
    ]).then(([t, l]) => {
      setTasks(Array.isArray(t) ? t : []);
      setLogs(Array.isArray(l) ? l : []);
      // Expand first stage by default
      if (Array.isArray(t) && t.length > 0) {
        const stages = new Set<string>();
        t.forEach((tk: DeliveryTask) => stages.add(tk.stage_name || '默认阶段'));
        const firstStage = stages.values().next().value;
        if (firstStage) setExpandedStages(new Set([firstStage]));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [ipId]);

  const loadAttachments = async (taskId: number) => {
    if (attachments.has(taskId) || loadingAttach.has(taskId)) return;
    setLoadingAttach(prev => new Set(prev).add(taskId));
    try {
      const res = await fetch(`/api/ips/${ipId}/delivery-tasks/${taskId}/attachments`);
      const data = await res.json();
      setAttachments(prev => new Map(prev).set(taskId, Array.isArray(data) ? data : []));
    } catch {}
    setLoadingAttach(prev => {
      const next = new Set(prev); next.delete(taskId); return next;
    });
  };

  const handleCheck = (task: DeliveryTask) => {
    if (task.status === 'completed') {
      fetch(`/api/ips/${ipId}/delivery-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'not_started', task_name: task.task_name }),
      }).then(() => { fetchTasks(); fetchLogs(); });
    } else {
      setCompleteTask(task);
      setCompletionNote('');
      setCompleteFiles([]);
    }
  };

  const handleCompleteSubmit = async () => {
    if (!completeTask) return;
    setSubmitting(true);
    try {
      const taskRes = await fetch(`/api/ips/${ipId}/delivery-tasks/${completeTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', task_name: completeTask.task_name, completion_note: completionNote }),
      });
      if (!taskRes.ok) throw new Error('操作失败');
      for (const file of completeFiles) {
        const fd = new FormData();
        fd.append('file', file);
        await fetch(`/api/ips/${ipId}/delivery-tasks/${completeTask.id}/attachments`, { method: 'POST', body: fd });
      }
      setCompleteTask(null);
      fetchTasks(); fetchLogs();
    } catch {} finally { setSubmitting(false); }
  };

  const handleNewTask = async () => {
    if (!newTaskName.trim()) return;
    setNewTaskSaving(true);
    try {
      await fetch(`/api/ips/${ipId}/delivery-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_name: newTaskStage || '其他', task_name: newTaskName.trim(), description: newTaskDesc, due_date: newTaskDue }),
      });
      setShowNewTask(false);
      setNewTaskStage(''); setNewTaskName(''); setNewTaskDesc(''); setNewTaskDue('');
      fetchTasks(); fetchLogs();
    } catch {} finally { setNewTaskSaving(false); }
  };

  const toggleStage = (name: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Group by stage
  const stages = new Map<string, DeliveryTask[]>();
  tasks.forEach(t => {
    const s = t.stage_name || '默认阶段';
    if (!stages.has(s)) stages.set(s, []);
    stages.get(s)!.push(t);
  });

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const overdueCount = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    return t.due_date && t.due_date < new Date().toISOString().split('T')[0];
  }).length;

  if (loading) return <div className="text-center py-8 text-gray-500 text-[13px]">加载中...</div>;

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-semibold text-gray-700">
              {is6980 ? '课程进度' : '交付进度'}
            </span>
            <span className={`text-[20px] font-bold font-mono ${
              progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-500' : 'text-red-500'
            }`}>{progress}%</span>
          </div>
          <span className="text-[12px] text-gray-500">{completedCount}/{tasks.length} {is6980 ? '节课已完成' : '任务完成'}</span>
        </div>
        <div className="h-2.5 rounded-full bg-black/[0.04] overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${
            progress >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
            progress >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
            'bg-gradient-to-r from-red-400 to-red-500'
          }`} style={{ width: `${progress}%` }} />
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-1.5 mt-2 text-[12px] text-red-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {overdueCount} 个任务已逾期
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-black/5 pb-2">
        <button onClick={() => setActiveTab('tasks')}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
            activeTab === 'tasks' ? 'bg-emerald-500/15 text-emerald-700' : 'text-gray-500 hover:bg-black/5'
          }`}>
          {is6980 ? '课程表' : '交付任务'} ({tasks.length})
        </button>
        <button onClick={() => setActiveTab('logs')}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
            activeTab === 'logs' ? 'bg-emerald-500/15 text-emerald-700' : 'text-gray-500 hover:bg-black/5'
          }`}>
          交付记录 ({logs.length})
        </button>
        <button onClick={() => { setShowNewTask(true); }}
          className="ml-auto px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          新建任务
        </button>
      </div>

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-[13px]">暂无交付任务</p>
              <p className="text-[11px] text-gray-400 mt-1">
                {is6980 ? '请先为 IP 设置课程开始日期，系统将自动生成课程表' : '请先为 IP 选择产品类型，或手动新建任务'}
              </p>
            </div>
          ) : (
            Array.from(stages.entries()).map(([stageName, stageTasks]) => {
              const stageCompleted = stageTasks.filter(t => t.status === 'completed').length;
              const stageTotal = stageTasks.length;
              const isExpanded = expandedStages.has(stageName);

              return (
                <div key={stageName} className="glass-card overflow-hidden">
                  <button
                    onClick={() => toggleStage(stageName)}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <div>
                        <span className="text-[13px] font-semibold text-gray-700">{stageName}</span>
                        <span className="ml-2 text-[11px] text-gray-400">
                          {stageCompleted}/{stageTotal} 完成
                        </span>
                      </div>
                    </div>
                    {/* Mini progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-black/[0.04] overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          stageCompleted === stageTotal ? 'bg-emerald-400' : stageCompleted > 0 ? 'bg-amber-400' : 'bg-gray-200'
                        }`} style={{ width: `${Math.round((stageCompleted / stageTotal) * 100)}%` }} />
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-black/[0.02]">
                      {stageTasks.map((task, idx) => {
                        const isOverdue = task.status !== 'completed' && task.status !== 'cancelled' && task.due_date && task.due_date < new Date().toISOString().split('T')[0];
                        const st = statusConfig[task.status] || statusConfig.not_started;
                        const taskAttachments = attachments.get(task.id) || [];
                        const displayDate = task.due_date || '';
                        const isLes = isLesson(task.task_name);
                        const isAsgn = isAssignment(task.task_name);
                        const isCere = isCeremony(task.task_name);

                        return (
                          <div key={task.id}
                            className={`px-4 py-3 border-b border-black/[0.02] last:border-b-0 transition-colors ${
                              task.status === 'completed' ? 'bg-emerald-50/20' : ''
                            } ${
                              isAsgn ? 'bg-amber-50/10 border-l-4 border-l-amber-300' : ''
                            } ${
                              isCere ? 'bg-purple-50/10 border-l-4 border-l-purple-300' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Checkbox */}
                              <button
                                onClick={() => handleCheck(task)}
                                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                  task.status === 'completed'
                                    ? 'bg-emerald-500 border-emerald-500'
                                    : isOverdue ? 'border-red-300 hover:border-red-400' : 'border-gray-300 hover:border-emerald-400'
                                }`}
                              >
                                {task.status === 'completed' && (
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Date badge for 6980 lessons */}
                                  {is6980 && displayDate && (
                                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${
                                      task.status === 'completed'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : isOverdue ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'
                                    }`}>
                                      {formatDate(displayDate)} 19:30
                                    </span>
                                  )}
                                  {!is6980 && displayDate && (
                                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">
                                      截止：{displayDate}
                                    </span>
                                  )}
                                  <span className={`text-[13px] font-medium ${
                                    task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-800'
                                  }`}>
                                    {isLes && (
                                      <span className="text-[11px] text-emerald-600 font-semibold mr-1">
                                        {(task.task_name.match(/^第(\d+)讲/) || [])[1] ? `第${(task.task_name.match(/^第(\d+)讲/) || [])[1]}讲` : ''}
                                      </span>
                                    )}
                                    {isAsgn && <span className="text-[11px] text-amber-600 mr-1">📝</span>}
                                    {isCere && <span className="text-[11px] text-purple-600 mr-1">🎓</span>}
                                    {is6980 && isLes ? task.task_name.replace(/^第\d+讲[：:]\s*/, '') : task.task_name}
                                  </span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${st.cls}`}>{st.label}</span>
                                  {task.is_required ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 border border-red-200">必交付</span>
                                  ) : null}
                                  {isOverdue && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200 font-medium">逾期</span>
                                  )}
                                </div>
                                {/* Instructor / description */}
                                {task.description && (
                                  <p className="text-[12px] text-gray-500 mt-0.5">{task.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400 flex-wrap">
                                  {task.completed_at && <span>完成于 {task.completed_at}</span>}
                                  {task.completion_note && <span className="text-gray-500">备注：{task.completion_note}</span>}
                                  {taskAttachments.length > 0 && (
                                    <span className="text-emerald-600">{taskAttachments.length} 个附件</span>
                                  )}
                                  <button onClick={() => loadAttachments(task.id)} className="text-emerald-600 hover:text-emerald-500">
                                    {loadingAttach.has(task.id) ? '加载中...' : taskAttachments.length > 0 ? '查看附件' : ''}
                                  </button>
                                </div>
                                {/* Attachments */}
                                {taskAttachments.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {taskAttachments.map(a => (
                                      <a key={a.id} href={`/api/uploads/${a.file_path}`} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-600 hover:bg-emerald-100 transition-colors">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                        {a.file_name}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <div className="space-y-0">
          {logs.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-[13px]">暂无交付记录</p>
            </div>
          ) : (
            <div className="relative before:absolute before:left-[15px] before:top-0 before:bottom-0 before:w-0.5 before:bg-gray-100">
              {logs.map((log, i) => (
                <div key={log.id} className="flex gap-4 relative pb-4">
                  <div className={`w-[18px] h-[18px] rounded-full flex-shrink-0 mt-0.5 z-10 border-2 ${
                    log.action_type === 'complete_task' ? 'bg-emerald-500 border-emerald-400' :
                    log.action_type === 'create_client' ? 'bg-blue-500 border-blue-400' :
                    log.action_type === 'create_task' ? 'bg-cyan-500 border-cyan-400' :
                    log.action_type === 'upload_attachment' ? 'bg-purple-500 border-purple-400' :
                    i === 0 ? 'bg-emerald-500 border-emerald-400' : 'bg-gray-300 border-gray-200'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-medium text-gray-700">{log.operator_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{actionLabels[log.action_type] || log.action_type}</span>
                      {log.old_status && log.new_status && (
                        <span className="text-[10px] text-gray-400">
                          {(statusConfig[log.old_status]?.label || log.old_status)} → {(statusConfig[log.new_status]?.label || log.new_status)}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-gray-600 mt-0.5">{log.content}</p>
                    <span className="text-[10px] text-gray-400 mt-0.5 block">{log.created_at}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Complete Task Modal */}
      <Modal open={!!completeTask} onClose={() => setCompleteTask(null)} title="完成核销">
        {completeTask && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200">
              <p className="text-[13px] font-semibold text-gray-700">{completeTask.task_name}</p>
              {completeTask.description && <p className="text-[12px] text-gray-500 mt-1">{completeTask.description}</p>}
              {completeTask.due_date && (
                <p className="text-[11px] text-gray-400 mt-1">
                  {is6980 ? `上课日期：${formatDate(completeTask.due_date)} 19:30` : `截止日期：${completeTask.due_date}`}
                </p>
              )}
            </div>
            <Textarea
              label="交付说明 *"
              value={completionNote}
              onChange={e => setCompletionNote(e.target.value)}
              placeholder="请填写交付内容、完成情况等..."
              rows={4}
            />
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5 ml-1">交付附件</label>
              <input ref={fileInputRef} type="file" multiple
                onChange={e => { if (e.target.files) setCompleteFiles(Array.from(e.target.files)); }}
                className="text-[12px] text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[12px] file:font-medium file:bg-emerald-500/15 file:text-emerald-600 hover:file:bg-emerald-500/25 file:cursor-pointer"
              />
              {completeFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {completeFiles.map((f, i) => (
                    <div key={i} className="text-[12px] text-gray-500">{f.name} ({(f.size / 1024).toFixed(1)} KB)</div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setCompleteTask(null)}>取消</Button>
              <Button onClick={handleCompleteSubmit} disabled={submitting || !completionNote.trim()}>
                {submitting ? '提交中...' : '确认核销'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* New Task Modal */}
      <Modal open={showNewTask} onClose={() => setShowNewTask(false)} title="新建交付任务">
        <div className="space-y-4">
          <Input label="阶段名称" value={newTaskStage} onChange={e => setNewTaskStage(e.target.value)} placeholder="如：阶段一" />
          <Input label="任务名称 *" value={newTaskName} onChange={e => setNewTaskName(e.target.value)} placeholder="输入任务名称" />
          <Textarea label="任务描述" value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} placeholder="任务描述..." rows={2} />
          <Input label="截止日期" type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowNewTask(false)}>取消</Button>
            <Button onClick={handleNewTask} disabled={newTaskSaving || !newTaskName.trim()}>
              {newTaskSaving ? '创建中...' : '创建任务'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
