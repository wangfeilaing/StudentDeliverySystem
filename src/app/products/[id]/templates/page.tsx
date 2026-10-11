'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Template {
  id?: number;
  stage_name: string;
  task_name: string;
  description: string;
  due_day_offset: number;
  is_required: boolean;
  default_role: string;
  feishu_doc_url: string;
}

interface ProductType {
  id: number; name: string; price: number; service_days: number;
}

export default function TemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const productId = parseInt(id, 10);
  const router = useRouter();

  const [product, setProduct] = useState<ProductType | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${productId}`).then(r => r.json()),
      fetch(`/api/products/${productId}/templates`).then(r => r.json()),
    ]).then(([prod, temps]) => {
      setProduct(prod);
      setTemplates(Array.isArray(temps) ? temps : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [productId]);

  // Stage grouping
  const stages = new Map<string, Template[]>();
  templates.forEach(t => {
    const stage = t.stage_name || '默认阶段';
    if (!stages.has(stage)) stages.set(stage, []);
    stages.get(stage)!.push(t);
  });

  const addStage = () => {
    const name = prompt('请输入阶段名称：');
    if (!name || !name.trim()) return;
    if (stages.has(name.trim())) { alert('阶段名称已存在'); return; }
    setTemplates(prev => [...prev, {
      stage_name: name.trim(), task_name: '', description: '',
      due_day_offset: 7, is_required: true, default_role: '', feishu_doc_url: '',
    }]);
  };

  const addTask = (stageName: string) => {
    setTemplates(prev => [...prev, {
      stage_name: stageName, task_name: '', description: '',
      due_day_offset: 7, is_required: true, default_role: '', feishu_doc_url: '',
    }]);
  };

  const updateTemplate = (index: number, field: keyof Template, value: string | number | boolean) => {
    setTemplates(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removeTemplate = (index: number) => {
    setTemplates(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const validTemplates = templates.filter(t => t.task_name.trim());
    if (validTemplates.length === 0) { alert('请至少添加一个任务'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId}/templates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: validTemplates }),
      });
      if (!res.ok) throw new Error('保存失败');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch {}
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-12 text-gray-500 text-[13px]">加载中...</div>;

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.back()} className="text-[13px] text-gray-500 hover:text-gray-700 mb-1 flex items-center gap-1 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <h2 className="text-[20px] font-bold text-gray-800">{product?.name || '产品'} - 交付模板</h2>
          <p className="text-[13px] text-gray-500 mt-1">配置新建 IP 时自动生成的交付任务</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[13px] text-emerald-600 font-medium">已保存</span>}
          <Button onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存模板'}</Button>
        </div>
      </div>

      <div className="space-y-4">
        {Array.from(stages.entries()).map(([stageName, tasks]) => {
          const stageIndices = tasks.map(t => templates.indexOf(t));
          return (
            <div key={stageName} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-semibold text-gray-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {stageName}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500">{tasks.length} 个任务</span>
                  <button onClick={() => addTask(stageName)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors">
                    + 添加任务
                  </button>
                  <button onClick={() => stageIndices.forEach(i => removeTemplate(i))}
                    className="px-2 py-1 rounded-lg text-[11px] text-red-500 hover:bg-red-50 transition-colors">
                    删除阶段
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {tasks.map((t, idx) => {
                  const globalIdx = templates.indexOf(t);
                  return (
                    <div key={globalIdx} className="flex items-start gap-3 p-3 rounded-xl bg-white/50 border border-white/60">
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-4 gap-2">
                          <Input
                            value={t.task_name}
                            onChange={e => updateTemplate(globalIdx, 'task_name', e.target.value)}
                            placeholder="任务名称 *"
                            className="col-span-2"
                          />
                          <Input
                            type="number"
                            value={String(t.due_day_offset)}
                            onChange={e => updateTemplate(globalIdx, 'due_day_offset', parseInt(e.target.value) || 7)}
                            placeholder="截止天数"
                          />
                          <div className="flex items-center gap-2 h-full">
                            <label className="flex items-center gap-1.5 text-[12px] text-gray-500 cursor-pointer">
                              <input type="checkbox" checked={t.is_required}
                                onChange={e => updateTemplate(globalIdx, 'is_required', e.target.checked)}
                                className="rounded accent-emerald-500" />
                              必交付
                            </label>
                          </div>
                        </div>
                        <Textarea
                          value={t.description}
                          onChange={e => updateTemplate(globalIdx, 'description', e.target.value)}
                          placeholder="任务描述（可选）"
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          <Input
                            value={t.feishu_doc_url || ''}
                            onChange={e => updateTemplate(globalIdx, 'feishu_doc_url', e.target.value)}
                            placeholder="飞书文档链接（可选）"
                          />
                        </div>
                      </div>
                      <button onClick={() => removeTemplate(globalIdx)}
                        className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center flex-shrink-0 transition-colors mt-1">
                        <svg className="w-3.5 h-3.5 text-gray-400 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
                {tasks.length === 0 && (
                  <p className="text-center py-3 text-[12px] text-gray-400">暂无任务，点击"添加任务"开始</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={addStage}
        className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 text-[13px] font-medium text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors">
        + 添加阶段
      </button>
    </div>
  );
}
