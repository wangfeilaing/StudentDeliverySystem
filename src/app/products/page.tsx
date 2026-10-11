'use client';
import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';

interface ProductType {
  id: number; name: string; price: number; service_days: number;
  description: string; status: string; sort_order: number;
  ip_count: number;
  ips: Array<{ id: number; name: string; avatar_path: string | null; total_tasks: number; completed_tasks: number; progress: number }>;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductType | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [serviceDays, setServiceDays] = useState('90');
  const [description, setDescription] = useState('');

  const fetchProducts = () => {
    fetch('/api/products')
      .then(r => r.json())
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName(''); setPrice(''); setServiceDays('90'); setDescription('');
    setShowForm(true);
  };

  const openEdit = (p: ProductType) => {
    setEditing(p);
    setName(p.name); setPrice(String(p.price)); setServiceDays(String(p.service_days)); setDescription(p.description);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const url = editing ? `/api/products/${editing.id}` : '/api/products';
      const method = editing ? 'PUT' : 'POST';
      const body = { name: name.trim(), price: parseFloat(price) || 0, service_days: parseInt(serviceDays) || 90, description };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('操作失败');
      setShowForm(false);
      fetchProducts();
    } catch {}
    finally { setSaving(false); }
  };

  const toggleStatus = async (p: ProductType) => {
    const newStatus = p.status === 'active' ? 'inactive' : 'active';
    await fetch(`/api/products/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: p.name, price: p.price, service_days: p.service_days, description: p.description, status: newStatus }),
    });
    fetchProducts();
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[20px] font-bold text-gray-800">产品套餐管理</h2>
          <p className="text-[13px] text-gray-500 mt-1">管理产品类型与交付模板</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-md shadow-emerald-500/15 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          新建产品
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-[13px]">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <div key={p.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-[16px] font-bold text-gray-800">{p.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[20px] font-bold text-emerald-600">¥{p.price.toLocaleString()}</span>
                    <span className="text-[12px] text-gray-500">/{p.service_days}天</span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                  p.status === 'active' ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-400/20' : 'bg-gray-500/10 text-gray-500 border border-gray-400/20'
                }`}>
                  {p.status === 'active' ? '启用' : '停用'}
                </span>
              </div>
              {p.description && <p className="text-[13px] text-gray-500 mb-3">{p.description}</p>}

              {/* Student list */}
              <div className="mb-3">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 mb-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  学员 <span className="font-semibold text-gray-800">{p.ip_count}</span> 人
                </div>
                {p.ips.length === 0 ? (
                  <p className="text-[12px] text-gray-400 pl-5">暂无学员</p>
                ) : (
                  <div className="space-y-1.5">
                    {p.ips.map(ip => (
                      <Link
                        key={ip.id}
                        href={`/ips/${ip.id}`}
                        className="flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-black/5 transition-colors group"
                      >
                        {ip.avatar_path ? (
                          <img src={`/api/uploads/${ip.avatar_path}`} alt={ip.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-black/10" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-600 flex-shrink-0 border border-black/10">
                            {ip.name.charAt(0)}
                          </div>
                        )}
                        <span className="text-[13px] text-gray-700 flex-1 min-w-0 truncate group-hover:text-emerald-600 transition-colors">{ip.name}</span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">{ip.completed_tasks}/{ip.total_tasks}</span>
                        <div className="w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                          <div className={`h-full rounded-full ${ip.progress >= 80 ? 'bg-emerald-400' : ip.progress >= 40 ? 'bg-cyan-400' : ip.progress > 0 ? 'bg-amber-400' : 'bg-gray-200'}`} style={{ width: `${ip.progress}%` }} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Link href={`/products/${p.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-400/20 hover:bg-emerald-500/20 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  查看学员
                </Link>
                <Link href={`/products/${p.id}/templates`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-cyan-500/10 text-cyan-600 border border-cyan-400/20 hover:bg-cyan-500/20 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  交付模板
                </Link>
                <button onClick={() => openEdit(p)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-black/5 text-gray-600 hover:bg-black/10 transition-colors">
                  编辑
                </button>
                <button onClick={() => toggleStatus(p)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    p.status === 'active' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  }`}>
                  {p.status === 'active' ? '停用' : '启用'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? '编辑产品' : '新建产品'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="产品名称 *" value={name} onChange={e => setName(e.target.value)} placeholder="如：21 天确定性获客训练营" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="标准价格（元）" type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="6980" />
            <Input label="服务周期（天）" type="number" value={serviceDays} onChange={e => setServiceDays(e.target.value)} placeholder="90" />
          </div>
          <Textarea label="产品说明" value={description} onChange={e => setDescription(e.target.value)} placeholder="简要描述产品内容..." rows={3} />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>取消</Button>
            <Button type="submit" disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
