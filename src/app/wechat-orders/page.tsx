'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

interface WechatOrder {
  id: number;
  order_id: string;
  status: number;
  buyer_name: string;
  buyer_phone: string;
  buyer_province: string;
  buyer_city: string;
  buyer_address: string;
  product_names: string;
  product_count: number;
  order_amount: number;
  payment_method: number | null;
  pay_time: string;
  create_time: string;
  update_time: string;
  synced_at: string;
  remark: string;
  wecom_sales: string | null;
  wecom_added_at: string | null;
  wecom_contact_name: string | null;
  wecom_state: string;
  wecom_match_method: string;
  wecom_confidence: number;
}

interface SalesAssignment {
  id: number;
  sales_name: string;
  start_time: string;
  end_time: string | null;
  created_at: string;
  is_active: number;
}

interface WecomContactWay {
  id: number;
  config_id: number;
  staff_id: number | null;
  sales_name: string;
  wecom_userid: string;
  state: string;
  remark: string;
  qr_code: string;
  status: string;
  created_at: string;
}

// 旧课销售已清空，后续上新课时在此数组添加新销售名单即可
const SALES_NAMES: string[] = [];

function getTodayKey() {
  return 'wx_sync_' + new Date().toISOString().slice(0, 10);
}

function getSyncCount(): number {
  try {
    const data = JSON.parse(localStorage.getItem('wx_sync_log') || '{}');
    return data[getTodayKey()] || 0;
  } catch { return 0; }
}

function incSyncCount() {
  try {
    const data = JSON.parse(localStorage.getItem('wx_sync_log') || '{}');
    const key = getTodayKey();
    data[key] = (data[key] || 0) + 1;
    localStorage.setItem('wx_sync_log', JSON.stringify(data));
  } catch {}
}

const STATUS_MAP: Record<number, { label: string; cls: string }> = {
  10: { label: '待付款', cls: 'bg-amber-500/10 text-amber-600 border-amber-400/20' },
  12: { label: '礼物待收下', cls: 'bg-pink-500/10 text-pink-600 border-pink-400/20' },
  13: { label: '待成团', cls: 'bg-orange-500/10 text-orange-600 border-orange-400/20' },
  20: { label: '待发货', cls: 'bg-blue-500/10 text-blue-600 border-blue-400/20' },
  21: { label: '部分发货', cls: 'bg-cyan-500/10 text-cyan-600 border-cyan-400/20' },
  30: { label: '待收货', cls: 'bg-purple-500/10 text-purple-600 border-purple-400/20' },
  100: { label: '已完成', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-400/20' },
  200: { label: '已取消', cls: 'bg-gray-500/10 text-gray-500 border-gray-400/20' },
  250: { label: '已取消', cls: 'bg-gray-500/10 text-gray-500 border-gray-400/20' },
};

const PAYMENT_LABELS: Record<number, string> = {
  1: '微信支付', 2: '先用后付', 3: '抽奖0元', 4: '积分兑换',
};

export default function WechatOrdersPage() {
  const [orders, setOrders] = useState<WechatOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [search, setSearch] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [salesFilter, setSalesFilter] = useState('');
  const [batchTotals, setBatchTotals] = useState<Array<{ start_time: string; end_time: string; count: number }>>([]);
  const [salesRanges, setSalesRanges] = useState<SalesAssignment[]>([]);
  const [activeSales, setActiveSales] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<SalesAssignment[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ sales_name: '', start_time: '', end_time: '' });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteResult, setPasteResult] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pastePairs, setPastePairs] = useState<Array<{ orderId: string; phone: string; name: string; product: string }>>([]);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [wecomOpen, setWecomOpen] = useState(false);
  const [wecomSyncing, setWecomSyncing] = useState(false);
  const [wecomConfigs, setWecomConfigs] = useState<Array<{ id: number; corp_id: string; label: string }>>([]);
  const [wecomStaff, setWecomStaff] = useState<Array<{ id: number; config_id: number; sales_name: string; wecom_userid: string; label: string }>>([]);
  const [wecomContactWays, setWecomContactWays] = useState<WecomContactWay[]>([]);
  const [wecomForm, setWecomForm] = useState({ corpId: '', secret: '', label: '' });
  const [wecomStaffForm, setWecomStaffForm] = useState({ configId: 0, salesName: '', wecomUserid: '' });
  const [contactWayForm, setContactWayForm] = useState({ staffId: 0, channel: 'xczd' });
  const [contactWayCreating, setContactWayCreating] = useState(false);
  const limit = 20;

  const isRecentOrder = (createTime: string) => {
    if (!lastSyncTime) return false;
    const orderTime = new Date(createTime.replace(' ', 'T') + '+08:00').getTime();
    return (lastSyncTime - orderTime) < 6 * 3600 * 1000;
  };

  // Fetch sales time ranges when salesFilter changes
  useEffect(() => {
    if (!salesFilter) { setSalesRanges([]); return; }
    fetch('/api/sales-assignments')
      .then(r => r.json())
      .then(data => {
        const ranges = (data.items || [])
          .filter((a: SalesAssignment) => a.sales_name === salesFilter)
          .sort((a: SalesAssignment, b: SalesAssignment) => a.start_time.localeCompare(b.start_time));
        setSalesRanges(ranges);
      })
      .catch(() => setSalesRanges([]));
  }, [salesFilter]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (productFilter) params.set('product', productFilter);
      if (salesFilter) params.set('sales', salesFilter);
      if (search) params.set('q', search);
      params.set('page', String(page));
      params.set('limit', String(limit));
      const res = await fetch(`/api/wechat-orders?${params}`);
      const data = await res.json();
      setOrders(data.items || []);
      setTotal(data.total || 0);
      setBatchTotals(data.batchTotals || []);
    } catch {} finally { setLoading(false); }
  }, [statusFilter, productFilter, search, page, salesFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ---- 自动轮询刷新：定时同步小店最近订单并刷新列表（纯本地，无需公网） ----
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSec, setRefreshSec] = useState(60);
  const [countdown, setCountdown] = useState(60);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const autoBusyRef = useRef(false);
  const lastFireRef = useRef(0);
  const fetchOrdersRef = useRef(fetchOrders);
  useEffect(() => { fetchOrdersRef.current = fetchOrders; }, [fetchOrders]);

  // 读取 / 持久化用户偏好
  useEffect(() => {
    try {
      const ar = localStorage.getItem('wx_auto_refresh');
      const rs = localStorage.getItem('wx_refresh_sec');
      if (ar !== null) setAutoRefresh(ar === '1');
      if (rs) setRefreshSec(parseInt(rs, 10) || 60);
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem('wx_auto_refresh', autoRefresh ? '1' : '0'); } catch {} }, [autoRefresh]);
  useEffect(() => { try { localStorage.setItem('wx_refresh_sec', String(refreshSec)); } catch {} }, [refreshSec]);

  // 执行一次「同步小店最近1天 + 刷新列表」，带防重入与隐藏页暂停
  const runAutoSync = useCallback(async () => {
    if (autoBusyRef.current) return;
    if (typeof document !== 'undefined' && document.hidden) return; // 页面不可见时跳过，避免空耗与浪费接口配额
    const now = Date.now();
    if (now - lastFireRef.current < 5000) return; // 5 秒内不重复触发（兼容开发模式重复调用）
    lastFireRef.current = now;
    autoBusyRef.current = true;
    setAutoSyncing(true);
    try {
      const res = await fetch('/api/wechat-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setLastSyncTime(Date.now());
        // 仅当确有新增订单时才提示，避免刷屏
        if (data.message && /新增\s*[1-9]/.test(data.message)) setSyncMsg(data.message);
      }
      await fetchOrdersRef.current();
    } catch {} finally {
      autoBusyRef.current = false;
      setAutoSyncing(false);
    }
  }, []);

  // 倒计时 + 到点触发自动同步
  useEffect(() => {
    if (!autoRefresh) { setCountdown(refreshSec); return; }
    setCountdown(refreshSec);
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { runAutoSync(); return refreshSec; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshSec, runAutoSync]);

  const handleSync = async (days: number) => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/wechat-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      if (!res.ok) { setSyncMsg(data.error || '同步失败'); }
      else { incSyncCount(); setSyncMsg(data.message); setLastSyncTime(Date.now()); fetchOrders(); }
    } catch { setSyncMsg('网络错误'); }
    finally { setSyncing(false); }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/wechat-orders/import-csv', { method: 'POST', body: form });
      const data = await res.json();
      setSyncMsg(res.ok ? data.message : (data.error || '导入失败'));
      if (res.ok) fetchOrders();
    } catch { setSyncMsg('网络错误'); }
    finally { setSyncing(false); e.target.value = ''; }
  };

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch('/api/sales-assignments');
      const data = await res.json();
      const items = data.items || [];
      setAssignments(items);
      const active = items.find((a: SalesAssignment) => a.is_active);
      setActiveSales(active?.sales_name || null);
    } catch {}
  }, []);

  // Load active assignment on mount
  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const startAssignment = async (salesName: string) => {
    await fetch('/api/sales-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sales_name: salesName }),
    });
    setActiveSales(salesName);
    fetchAssignments();
  };

  const stopAssignment = async (salesName: string) => {
    await fetch('/api/sales-assignments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sales_name: salesName }),
    });
    setActiveSales(null);
    fetchAssignments();
  };

  const handlePastePreview = async () => {
    if (!pasteText.trim()) return;
    setPasteLoading(true);
    setPasteResult('');
    setPastePairs([]);
    try {
      const res = await fetch('/api/wechat-orders/paste-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasteResult(data.error || '解析失败');
      } else {
        setPastePairs(data.pairs || []);
      }
    } catch { setPasteResult('网络错误'); }
    finally { setPasteLoading(false); }
  };

  const handlePasteApply = async () => {
    setPasteLoading(true);
    setPasteResult('');
    try {
      const res = await fetch('/api/wechat-orders/paste-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'apply',
          pairs: pastePairs.map(p => ({ orderId: p.orderId, name: p.name })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasteResult(data.message);
        fetchOrders();
        setPasteText('');
        setPastePairs([]);
      } else {
        setPasteResult(data.error || '导入失败');
      }
    } catch { setPasteResult('网络错误'); }
    finally { setPasteLoading(false); }
  };

  const updatePairName = (index: number, name: string) => {
    setPastePairs(prev => {
      const next = [...prev];
      next[index] = { ...next[index], name };
      return next;
    });
  };

  const addAssignment = async () => {
    const { sales_name, start_time, end_time } = assignForm;
    if (!start_time || !end_time) return;
    // datetime-local gives "YYYY-MM-DDTHH:MM", convert to "YYYY-MM-DD HH:MM:SS"
    await fetch('/api/sales-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sales_name,
        start_time: start_time.replace('T', ' ') + ':00',
        end_time: end_time.replace('T', ' ') + ':00',
      }),
    });
    setAssignForm({ ...assignForm, start_time: '', end_time: '' });
    fetchAssignments();
  };

  const deleteAssignment = async (id: number) => {
    await fetch(`/api/sales-assignments?id=${id}`, { method: 'DELETE' });
    fetchAssignments();
  };

  const fetchWecomData = useCallback(async () => {
    try {
      const res = await fetch('/api/wecom');
      const data = await res.json();
      setWecomConfigs(data.configs || []);
      setWecomStaff(data.staff || []);
      setWecomContactWays(data.contactWays || []);
    } catch {}
  }, []);

  const handleWecomSaveConfig = async () => {
    await fetch('/api/wecom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_config', ...wecomForm }),
    });
    setWecomForm({ corpId: '', secret: '', label: '' });
    fetchWecomData();
  };

  const handleWecomAddStaff = async () => {
    await fetch('/api/wecom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_staff', ...wecomStaffForm }),
    });
    setWecomStaffForm(prev => ({ ...prev, wecomUserid: '' }));
    fetchWecomData();
  };

  const handleWecomDelete = async (id: number, type: string) => {
    await fetch(`/api/wecom?id=${id}&type=${type}`, { method: 'DELETE' });
    fetchWecomData();
  };

  const handleWecomSync = async () => {
    setWecomSyncing(true);
    try {
      const res = await fetch('/api/wecom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const data = await res.json();
      setSyncMsg(data.message || data.error || '同步完成');
      if (res.ok) fetchOrders();
    } catch { setSyncMsg('网络错误'); }
    finally { setWecomSyncing(false); }
  };

  const handleCreateContactWay = async () => {
    if (!contactWayForm.staffId) return;
    setContactWayCreating(true);
    try {
      const res = await fetch('/api/wecom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_contact_way',
          staffId: contactWayForm.staffId,
          channel: contactWayForm.channel || 'xczd',
        }),
      });
      const data = await res.json();
      setSyncMsg(data.error || '企微二维码已生成');
      fetchWecomData();
    } catch {
      setSyncMsg('生成企微二维码失败');
    } finally {
      setContactWayCreating(false);
    }
  };

  function RemarkCell({ order, onUpdate }: { order: WechatOrder; onUpdate: () => void }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(order.remark || '');
    const [saving, setSaving] = useState(false);

    const save = async () => {
      if (value === (order.remark || '')) { setEditing(false); return; }
      setSaving(true);
      try {
        await fetch('/api/wechat-orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.order_id, remark: value }),
        });
        onUpdate();
      } catch {} finally { setSaving(false); setEditing(false); }
    };

    if (editing) {
      return (
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(order.remark || ''); setEditing(false); } }}
          disabled={saving}
          className="text-[11px] px-2 py-1 rounded border border-emerald-300 bg-white text-gray-700 w-[100px] focus:outline-none focus:border-emerald-400"
          placeholder="添加备注..."
        />
      );
    }

    return (
      <button
        onClick={() => setEditing(true)}
        className="text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-2 py-1 rounded transition-colors cursor-text max-w-[100px] truncate block text-left"
        title={order.remark || '点击添加备注'}
      >
        {order.remark || '—'}
      </button>
    );
  }

  const totalPages = Math.ceil(total / limit);

  // Build grouped table rows when sales filter is active
  const tableRows = (() => {
    const items: Array<{ type: 'header'; label: string; key: string } | { type: 'order'; order: WechatOrder }> = [];
    if (salesRanges.length > 0) {
      const batchOrders: WechatOrder[][] = salesRanges.map(() => []);
      const unassigned: WechatOrder[] = [];
      for (const o of orders) {
        let found = false;
        for (let i = 0; i < salesRanges.length; i++) {
          const range = salesRanges[i];
          const inRange = o.create_time >= range.start_time &&
            (!range.end_time || o.create_time <= range.end_time);
          if (inRange) {
            batchOrders[i].push(o);
            found = true;
            break;
          }
        }
        if (!found) unassigned.push(o);
      }
      for (let i = 0; i < salesRanges.length; i++) {
        const range = salesRanges[i];
        const st = range.start_time.slice(0, 16).replace(' ', ' ');
        const et = range.end_time ? range.end_time.slice(0, 16).replace(' ', ' ') : '至今';
        const totalForBatch = batchTotals.find(
          bt => bt.start_time === range.start_time && bt.end_time === (range.end_time || '进行中')
        )?.count ?? batchOrders[i].length;
        items.push({ type: 'header', label: `第${i + 1}次下量  ${st} ~ ${et}  ·  ${totalForBatch} 单`, key: `h-${range.id}` });
        for (const o of batchOrders[i]) items.push({ type: 'order', order: o });
      }
      if (unassigned.length > 0) {
        items.push({ type: 'header', label: `未匹配时段  ·  ${unassigned.length} 单`, key: 'h-unassigned' });
        for (const o of unassigned) items.push({ type: 'order', order: o });
      }
    } else {
      for (const o of orders) items.push({ type: 'order', order: o });
    }
    return items;
  })();

  return (
    <div className="animate-fade-up p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">流量管理</h1>
          <p className="text-[13px] text-gray-500 mt-1">微信小店订单同步 · 客户数据沉淀</p>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && <span className="text-[12px] text-gray-500">{syncMsg}</span>}
          {/* 自动刷新控制 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAutoRefresh(v => !v)}
              title={autoRefresh ? '点击暂停自动刷新' : '点击开启自动刷新'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                autoRefresh
                  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-400/30'
                  : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
              {autoRefresh ? '自动刷新' : '已暂停'}
            </button>
            {autoRefresh && (
              <>
                <select
                  value={refreshSec}
                  onChange={e => setRefreshSec(parseInt(e.target.value, 10))}
                  className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-500 focus:outline-none focus:border-emerald-400"
                >
                  <option value={30}>30秒</option>
                  <option value={60}>1分钟</option>
                  <option value={300}>5分钟</option>
                </select>
                <span className="text-[10px] text-gray-400 tabular-nums w-[58px] text-right">
                  {autoSyncing ? '同步中…' : `${countdown}s`}
                </span>
              </>
            )}
          </div>
          <span className="text-[10px] text-gray-400">今日已同步 {getSyncCount()} 次</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleCsvImport}
            className="hidden"
            id="csv-upload"
          />
          <label
            htmlFor="csv-upload"
            className="px-4 py-2 rounded-xl text-[12px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            导入 CSV
          </label>
          <button
            onClick={() => { setPasteOpen(true); setPasteText(''); setPasteResult(''); setPastePairs([]); }}
            className="px-4 py-2 rounded-xl text-[12px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            粘贴导入
          </button>
          {[1, 3, 7, 15, 30].map(d => (
            <button
              key={d}
              onClick={() => handleSync(d)}
              disabled={syncing}
              className="px-3 py-2 rounded-xl text-[12px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              {syncing ? '...' : `同步${d}天`}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="glass-card p-3 text-center">
          <p className="text-[22px] font-bold font-mono text-gray-800">{total}</p>
          <p className="text-[10px] text-gray-500">总订单</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-[22px] font-bold font-mono text-blue-600">
            {orders.filter(o => o.status === 20 || o.status === 21).length}
          </p>
          <p className="text-[10px] text-gray-500">待发货</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-[22px] font-bold font-mono text-emerald-600">
            {orders.filter(o => o.status === 100).length}
          </p>
          <p className="text-[10px] text-gray-500">已完成</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-[22px] font-bold font-mono text-amber-600">
            {orders.filter(o => o.status === 10).length}
          </p>
          <p className="text-[10px] text-gray-500">待付款</p>
        </div>
      </div>

      {/* Cost estimate */}
      <div className="glass-card p-3 mb-5 flex items-center justify-center gap-8">
        <div className="text-center">
          <p className="text-[10px] text-gray-500 mb-0.5">预估投放总花费（30~50 元/单）</p>
          <p className="text-[16px] font-bold font-mono text-gray-800">
            ¥{(total * 30).toLocaleString()} ~ ¥{(total * 50).toLocaleString()}
          </p>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="text-center">
          <p className="text-[10px] text-gray-500 mb-0.5">扣除 5.2 元/单后</p>
          <p className="text-[16px] font-bold font-mono text-emerald-700">
            ¥{((total * 30) - (total * 5.2)).toLocaleString()} ~ ¥{((total * 50) - (total * 5.2)).toLocaleString()}
          </p>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="text-center">
          <p className="text-[10px] text-gray-500 mb-0.5">企微匹配率</p>
          <p className="text-[16px] font-bold font-mono text-violet-700">
            {orders.filter(o => o.wecom_sales).length} / {orders.length}
          </p>
        </div>
      </div>

      {/* 筛选面板 */}
      <div className="glass-card p-5 mb-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </div>
          <span className="text-[14px] font-bold text-gray-700">订单筛选</span>
        </div>

        {/* 产品 */}
        <div className="grid grid-cols-[56px_1fr] items-center gap-3">
          <span className="text-[13px] text-gray-500 font-medium">产品</span>
          <div className="flex gap-2">
            {[
              { key: '', label: '全部产品' },
              { key: '3天人生觉醒特训营', label: '3天人生觉醒特训营' },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => { setProductFilter(p.key); setPage(1); }}
                className={`flex-1 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                  productFilter === p.key
                    ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-400/30 shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-emerald-200 hover:text-emerald-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 销售 */}
        <div className="grid grid-cols-[56px_1fr] items-center gap-3">
          <span className="text-[13px] text-gray-500 font-medium">销售</span>
          <div className="flex gap-2">
            {[
              { key: '', label: '全部' },
              ...SALES_NAMES.map(n => ({ key: n, label: n })),
            ].map(s => (
              <button
                key={s.key}
                onClick={() => { setSalesFilter(s.key); setPage(1); }}
                className={`flex-1 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                  salesFilter === s.key
                    ? 'bg-violet-500/10 text-violet-700 border border-violet-400/30 shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-violet-200 hover:text-violet-600'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 状态 + 搜索 */}
        <div className="grid grid-cols-[56px_1fr] items-center gap-3">
          <span className="text-[13px] text-gray-500 font-medium">状态</span>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="text-[13px] px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 focus:outline-none focus:border-emerald-400 flex-1"
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="搜索姓名、手机号、订单号..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="flex-[3] text-[13px] px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 focus:outline-none focus:border-emerald-400 placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* 下量控制面板 */}
      <div className="glass-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.22-2.98 2.79-3.12A3.18 3.18 0 0114.5 16c0 1.72-1.34 3-2.79 3z"/>
            </svg>
          </div>
          <span className="text-[15px] font-bold text-gray-700">下量控制</span>
          {activeSales ? (
            <span className="text-[12px] px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 border border-emerald-400/20 font-medium">
              当前: {activeSales} 下量中
            </span>
          ) : (
            <span className="text-[12px] text-gray-400">— 暂未开启下量</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {SALES_NAMES.map(name => {
            const isActive = activeSales === name;
            return (
              <button
                key={name}
                onClick={() => isActive ? stopAssignment(name) : startAssignment(name)}
                className={`flex flex-col items-center gap-3 py-5 rounded-2xl transition-all active:scale-[0.97] cursor-pointer select-none ${
                  isActive
                    ? 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/50'
                    : 'bg-white text-gray-400 border-2 border-dashed border-gray-200 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/30 hover:shadow-md'
                }`}
              >
                <span className={`font-bold text-[16px] ${isActive ? 'text-white/90' : 'text-gray-700'}`}>{name}</span>
                <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${isActive ? 'text-white' : ''}`}>
                  {isActive ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      下量中
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      开启下量
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">开启下量后，该时段内的新订单自动归属对应销售</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchAssignments(); setAssignOpen(true); }}
              className="px-4 py-2 rounded-lg text-[12px] font-medium text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-all"
            >
              分配记录
            </button>
            <button
              onClick={() => { fetchWecomData(); setWecomOpen(true); }}
              className="px-4 py-2 rounded-lg text-[12px] font-medium text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-all"
            >
              企微设置
            </button>
            <button
              onClick={handleWecomSync}
              disabled={wecomSyncing}
              className="px-4 py-2 rounded-lg text-[12px] font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 transition-all shadow-sm"
            >
              {wecomSyncing ? '同步中...' : '同步企微'}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-[13px]">加载中...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-10">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-[13px] text-gray-500">暂无订单数据</p>
            <p className="text-[12px] text-gray-400 mt-1">点击「立即同步」从微信小店拉取订单</p>
          </div>
        ) : (
          <>
          {(() => {
            const recentCount = orders.filter(o => isRecentOrder(o.create_time)).length;
            if (recentCount > 0) {
              return (
                <div className="bg-emerald-50/60 border-b border-emerald-100 px-4 py-2 text-center">
                  <span className="text-[11px] text-emerald-700 font-medium">
                    最近 6 小时新增 <span className="font-bold">{recentCount}</span> 单
                    <span className="text-emerald-500 font-normal ml-1">— 已在下表中高亮标记</span>
                  </span>
                </div>
              );
            }
            return null;
          })()}
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">订单信息</th>
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">客户</th>
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">备注</th>
                <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">商品</th>
                <th className="text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">金额</th>
                <th className="text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">状态</th>
                <th className="text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5 w-[60px]">企微</th>
                <th className="text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">下单时间</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(row => {
                if (row.type === 'header') {
                  return (
                    <tr key={row.key} className="bg-violet-50/60">
                      <td colSpan={8} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                          <span className="text-[11px] font-semibold text-violet-700">{row.label}</span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const order = row.order;
                const st = STATUS_MAP[order.status] || { label: '未知', cls: 'bg-gray-100 text-gray-500 border-gray-200' };
                const recent = isRecentOrder(order.create_time);
                return (
                  <tr key={order.id} className={`border-b border-gray-50 hover:bg-gray-50/30 transition-colors ${recent ? 'bg-emerald-50/40 border-l-2 border-l-emerald-400' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[12px] font-mono text-gray-500">{order.order_id}</p>
                        {recent && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded whitespace-nowrap">NEW</span>}
                      </div>
                      {order.pay_time && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {PAYMENT_LABELS[order.payment_method || 0] || ''} {order.pay_time}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[12px] font-medium text-gray-700">{order.buyer_name || '-'}</p>
                      <p className="text-[11px] text-gray-400">{order.buyer_phone || '-'}</p>
                      {order.buyer_address && (
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[140px]" title={order.buyer_province + order.buyer_city + order.buyer_address}>
                          {order.buyer_province}{order.buyer_city} {order.buyer_address}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RemarkCell order={order} onUpdate={fetchOrders} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[12px] text-gray-600 truncate max-w-[180px]" title={order.product_names}>
                        {order.product_names || '-'}
                      </p>
                      <p className="text-[10px] text-gray-400">×{order.product_count}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[13px] font-semibold text-gray-800">¥{order.order_amount.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-lg border ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {order.wecom_sales ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap"
                            title={`已添加 ${order.wecom_sales} 企微${order.wecom_state ? ` · 来源 ${order.wecom_state}` : ''}${order.wecom_added_at ? ` · 添加时间 ${order.wecom_added_at}` : ''}`}
                          >
                            {order.wecom_sales}
                          </span>
                          {order.wecom_state && (
                            <span className="text-[9px] text-gray-400 max-w-[72px] truncate" title={order.wecom_state}>
                              {order.wecom_confidence ? `${order.wecom_confidence}%` : '已匹配'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-[11px] text-gray-500">{order.create_time?.slice(0, 16)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 text-[11px] rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50">
            上一页
          </button>
          <span className="text-[11px] text-gray-500 px-2">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1.5 text-[11px] rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50">
            下一页
          </button>
        </div>
      )}

      {/* Assignment Management Modal */}
      {assignOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAssignOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[520px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-bold text-gray-800">下量分配记录</h2>
              <button onClick={() => setAssignOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Current status */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-[11px] font-medium text-gray-600 mb-3">当前状态</p>
              <div className="space-y-2">
                {SALES_NAMES.map(name => {
                  const isActive = activeSales === name;
                  const lastAssignment = assignments
                    .filter(a => a.sales_name === name)
                    .sort((a, b) => b.start_time.localeCompare(a.start_time))[0];
                  return (
                    <div key={name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-300'}`} />
                        <span className="text-[15px] font-semibold text-gray-700">{name}</span>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                            下量中
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {lastAssignment && (
                          <span className="text-[10px] text-gray-400">
                            上次: {lastAssignment.start_time?.slice(0, 16).replace(' ', ' ')}
                            {lastAssignment.end_time ? ` ~ ${lastAssignment.end_time.slice(0, 16).replace(' ', ' ')}` : ' ~ 至今'}
                          </span>
                        )}
                        {isActive ? (
                          <button
                            onClick={() => stopAssignment(name)}
                            className="text-[11px] px-3 py-1.5 rounded-lg font-semibold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm transition-all"
                          >
                            下量中 · 关闭
                          </button>
                        ) : (
                          <button
                            onClick={() => startAssignment(name)}
                            className="text-[11px] px-3 py-1.5 rounded-lg font-semibold text-gray-500 bg-white border border-gray-200 hover:border-emerald-300 hover:text-emerald-600 transition-all"
                          >
                            开启下量
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Manual add (for backdating) */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-[11px] font-medium text-gray-600 mb-3">手动补录（用于回溯历史数据）</p>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={assignForm.sales_name}
                  onChange={e => setAssignForm({ ...assignForm, sales_name: e.target.value })}
                  className="text-[12px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700"
                >
                  {SALES_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <input
                  type="datetime-local"
                  value={assignForm.start_time}
                  onChange={e => setAssignForm({ ...assignForm, start_time: e.target.value })}
                  className="text-[12px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 w-[170px]"
                  placeholder="开始时间"
                />
                <span className="text-gray-400 text-[12px]">至</span>
                <input
                  type="datetime-local"
                  value={assignForm.end_time}
                  onChange={e => setAssignForm({ ...assignForm, end_time: e.target.value })}
                  className="text-[12px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 w-[170px]"
                  placeholder="结束时间"
                />
              </div>
              <button
                onClick={addAssignment}
                disabled={!assignForm.start_time || !assignForm.end_time}
                className="w-full mt-2 py-2 rounded-lg text-[12px] font-medium text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-40 transition-colors"
              >
                补录
              </button>
            </div>

            {/* History */}
            <div>
              <p className="text-[11px] font-medium text-gray-500 mb-2">历史记录</p>
              {assignments.length === 0 ? (
                <p className="text-[12px] text-gray-400 py-4 text-center">暂无分配记录</p>
              ) : (
                <div className="space-y-3">
                  {SALES_NAMES.map(name => {
                    const personAssignments = assignments
                      .filter(a => a.sales_name === name)
                      .sort((a, b) => b.start_time.localeCompare(a.start_time));
                    if (personAssignments.length === 0) return null;
                    return (
                      <div key={name}>
                        <p className="text-[11px] font-medium text-gray-600 mb-1.5">{name}</p>
                        <div className="space-y-1.5 ml-2">
                          {personAssignments.map((a, i) => {
                            const st = a.start_time?.slice(0, 16).replace(' ', ' ');
                            const et = a.end_time ? a.end_time.slice(0, 16).replace(' ', ' ') : '至今';
                            return (
                              <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                                <span className="text-[11px] text-gray-700">
                                  <span className="text-gray-400 mr-1.5">第{personAssignments.length - i}次</span>
                                  {st} ~ {et}
                                  {a.is_active ? (
                                    <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-600">进行中</span>
                                  ) : null}
                                </span>
                                <button
                                  onClick={() => deleteAssignment(a.id)}
                                  className="text-[10px] text-red-400 hover:text-red-600 transition-colors ml-2 flex-shrink-0"
                                >
                                  删除
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body
      )}

      {/* Paste Import Modal */}
      {pasteOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPasteOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[640px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-bold text-gray-800">
                {pastePairs.length > 0 ? '确认导入' : '粘贴导入'}
              </h2>
              <button onClick={() => setPasteOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {pastePairs.length > 0 ? (
              <>
                <p className="text-[11px] text-gray-500 mb-3">
                  识别到 <span className="font-semibold text-gray-700">{pastePairs.length}</span> 条匹配，请核对并修改姓名后确认导入。
                </p>
                <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-3 py-2 w-[130px]">订单号</th>
                        <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-3 py-2 w-[110px]">手机号</th>
                        <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-3 py-2">姓名</th>
                        <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-3 py-2">关联商品</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastePairs.map((pair, i) => (
                        <tr key={pair.orderId} className="border-b border-gray-50 hover:bg-gray-50/30">
                          <td className="px-3 py-2 text-[11px] font-mono text-gray-500">{pair.orderId}</td>
                          <td className="px-3 py-2 text-[11px] text-gray-500">{pair.phone}</td>
                          <td className="px-3 py-2">
                            <input
                              value={pair.name}
                              onChange={e => updatePairName(i, e.target.value)}
                              className="text-[11px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 w-[90px] focus:outline-none focus:border-emerald-400"
                            />
                          </td>
                          <td className="px-3 py-2 text-[11px] text-gray-400 truncate max-w-[150px]" title={pair.product}>
                            {pair.product || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pasteResult && (
                  <p className={`text-[12px] mb-3 ${pasteResult.includes('失败') ? 'text-red-500' : 'text-emerald-600'}`}>
                    {pasteResult}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPastePairs([]); setPasteResult(''); }}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    返回修改
                  </button>
                  <button
                    onClick={handlePasteApply}
                    disabled={pasteLoading}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-40 transition-all"
                  >
                    {pasteLoading ? '导入中...' : `确认导入 ${pastePairs.length} 条`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-gray-500 mb-3">
                  在微信小店后台订单列表页，选中订单行并复制（Ctrl+C），然后粘贴到下方文本框。
                </p>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="在此粘贴从小店后台复制的订单列表内容..."
                  rows={10}
                  className="w-full text-[12px] px-3 py-2 rounded-xl border border-gray-200 text-gray-700 focus:outline-none focus:border-emerald-400 resize-none"
                />
                {pasteResult && (
                  <p className={`text-[12px] mt-2 ${pasteResult.includes('失败') || pasteResult.includes('未能') ? 'text-red-500' : 'text-emerald-600'}`}>
                    {pasteResult}
                  </p>
                )}
                <button
                  onClick={handlePastePreview}
                  disabled={pasteLoading || !pasteText.trim()}
                  className="w-full mt-3 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-40 transition-all"
                >
                  {pasteLoading ? '解析中...' : '解析预览'}
                </button>
              </>
            )}
          </div>
        </div>
      , document.body
      )}

      {/* WeCom Config Modal */}
      {wecomOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setWecomOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[520px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-bold text-gray-800">企微设置</h2>
              <button onClick={() => setWecomOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Add config */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-[11px] font-medium text-gray-600 mb-3">新增企业微信应用</p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={wecomForm.label}
                  onChange={e => setWecomForm({ ...wecomForm, label: e.target.value })}
                  placeholder="备注名称（如：主企业微信）"
                  className="w-full text-[12px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700"
                />
                <input
                  type="text"
                  value={wecomForm.corpId}
                  onChange={e => setWecomForm({ ...wecomForm, corpId: e.target.value })}
                  placeholder="企业 Corp ID"
                  className="w-full text-[12px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-mono"
                />
                <input
                  type="password"
                  value={wecomForm.secret}
                  onChange={e => setWecomForm({ ...wecomForm, secret: e.target.value })}
                  placeholder="应用 Secret"
                  className="w-full text-[12px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-mono"
                />
              </div>
              <button
                onClick={handleWecomSaveConfig}
                disabled={!wecomForm.corpId || !wecomForm.secret}
                className="w-full mt-3 py-2 rounded-lg text-[12px] font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 transition-colors"
              >
                保存配置
              </button>
            </div>

            {/* Existing configs + staff */}
            {wecomConfigs.length === 0 ? (
              <p className="text-[12px] text-gray-400 py-4 text-center">暂无企微配置，请先添加</p>
            ) : (
              <div className="space-y-4">
                {wecomConfigs.map(config => {
                  const staffForConfig = wecomStaff.filter(s => s.config_id === config.id);
                  return (
                    <div key={config.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-[12px] font-medium text-gray-700">{config.label || '企业微信'}</span>
                          <span className="text-[10px] text-gray-400 ml-2 font-mono">{config.corp_id}</span>
                        </div>
                        <button onClick={() => handleWecomDelete(config.id, 'config')} className="text-[10px] text-red-400 hover:text-red-600">删除</button>
                      </div>

                      {/* Staff list for this config */}
                      {staffForConfig.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {staffForConfig.map(s => (
                            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                              <span className="text-[11px] text-gray-700">
                                <span className="text-emerald-600 font-medium">{s.sales_name}</span>
                                <span className="text-gray-400 mx-1.5">→</span>
                                <span className="font-mono text-gray-500">{s.wecom_userid}</span>
                              </span>
                              <button onClick={() => handleWecomDelete(s.id, 'staff')} className="text-[10px] text-red-400 hover:text-red-600">删除</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add staff form */}
                      <div className="flex items-center gap-2">
                        <select
                          value={wecomStaffForm.salesName}
                          onChange={e => setWecomStaffForm({ configId: config.id, salesName: e.target.value, wecomUserid: wecomStaffForm.wecomUserid })}
                          className="text-[11px] px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700"
                        >
                          {SALES_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <input
                          type="text"
                          value={wecomStaffForm.configId === config.id ? wecomStaffForm.wecomUserid : ''}
                          onChange={e => setWecomStaffForm({ configId: config.id, salesName: wecomStaffForm.salesName, wecomUserid: e.target.value })}
                          placeholder="企微 UserID"
                          className="flex-1 text-[11px] px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 font-mono"
                        />
                        <button
                          onClick={handleWecomAddStaff}
                          disabled={!wecomStaffForm.wecomUserid || wecomStaffForm.configId !== config.id}
                          className="text-[11px] px-2 py-1.5 rounded-lg font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40"
                        >
                          绑定
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Contact way QR management */}
            <div className="bg-emerald-50/60 rounded-xl p-4 mt-4 border border-emerald-100">
              <p className="text-[11px] font-medium text-emerald-700 mb-2">系统企微二维码</p>
              <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                用这里生成的二维码替换销售名片码。客户扫码后仍然添加对应销售，但企微会带回来源 state，系统同步后可以识别来源并辅助匹配订单。
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={contactWayForm.staffId}
                  onChange={e => setContactWayForm({ ...contactWayForm, staffId: parseInt(e.target.value, 10) || 0 })}
                  className="text-[11px] px-2 py-1.5 rounded-lg border border-emerald-200 bg-white text-gray-700 flex-1"
                >
                  <option value={0}>选择销售员工</option>
                  {wecomStaff.map(s => (
                    <option key={s.id} value={s.id}>{s.sales_name} · {s.wecom_userid}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={contactWayForm.channel}
                  onChange={e => setContactWayForm({ ...contactWayForm, channel: e.target.value })}
                  placeholder="渠道标识，如 xczd"
                  className="text-[11px] px-2 py-1.5 rounded-lg border border-emerald-200 bg-white text-gray-700 w-[120px]"
                />
                <button
                  onClick={handleCreateContactWay}
                  disabled={!contactWayForm.staffId || contactWayCreating}
                  className="text-[11px] px-3 py-1.5 rounded-lg font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40"
                >
                  {contactWayCreating ? '生成中...' : '生成二维码'}
                </button>
              </div>

              {wecomContactWays.length > 0 && (
                <div className="space-y-2 mt-3">
                  {wecomContactWays.map(w => (
                    <div key={w.id} className="flex items-center gap-3 bg-white rounded-xl border border-emerald-100 p-2.5">
                      {w.qr_code ? (
                        <img src={w.qr_code} alt={`${w.sales_name}企微二维码`} className="w-14 h-14 rounded-lg border border-gray-100 object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 flex-shrink-0">无二维码</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-gray-700">{w.sales_name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{w.state}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-mono truncate mt-1" title={w.qr_code}>{w.qr_code}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">生成时间：{w.created_at?.slice(0, 16)}</p>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(w.qr_code);
                          setSyncMsg('二维码链接已复制');
                        }}
                        disabled={!w.qr_code}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                      >
                        复制链接
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
              配置说明：在企微管理后台创建自建应用，获取 Corp ID 和 Secret。在「客户联系」中可查看每个员工的 UserID。绑定员工后生成二维码，并用新二维码替换当前投放平台上的销售二维码。
            </p>
          </div>
        </div>
      , document.body
      )}
    </div>
  );
}
