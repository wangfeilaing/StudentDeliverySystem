'use client';
import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let frame: number;
    let angle = 0;
    const tick = () => {
      angle = (angle + 0.3) % 360;
      document.documentElement.style.setProperty('--glow-angle', `${angle}deg`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError('用户名和密码不能为空'); return; }
    if (password.length < 6) { setError('密码至少6位'); return; }
    if (password !== confirmPassword) { setError('两次密码输入不一致'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, display_name: displayName, phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '注册失败'); return; }
      setSubmitted(true);
    } catch {
      setError('网络错误，请重试');
    } finally { setLoading(false); }
  };

  const bg = (
    <>
      <div className="fixed inset-0 z-0"
        style={{ backgroundImage: 'url(/login-bg-new.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div className="fixed inset-0 z-[1] bg-[#080c14]/60" />
    </>
  );

  if (submitted) {
    return (
      <div className="min-h-screen flex relative overflow-hidden">
        {bg}
        <div className="relative z-10 flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm p-8 text-center rounded-3xl"
            style={{ background: 'rgba(10,15,23,0.45)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 48px rgba(0,0,0,0.5)' }}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-[18px] font-bold text-white mb-2">申请已提交</h1>
            <p className="text-[13px] text-slate-400 mb-5">请等待管理员审核通过后即可登录</p>
            <Link href="/login" className="text-[13px] text-emerald-400 hover:text-emerald-300 transition-colors">返回登录</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {bg}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-8 animate-fade-up">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold text-white">申请注册</h1>
          <p className="text-[13px] text-slate-400 mt-1.5">聊心商学院 IP 数据管理系统</p>
        </div>

        <div className="w-full max-w-xl animate-fade-up">
          {/* Avatar above the card */}
          <div className="flex justify-center mb-[-28px] relative z-20">
            <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-emerald-500/25 border-[3px] border-white/15"
              style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
          </div>

          <div className="p-6 pt-10 rounded-3xl"
            style={{
              background: 'rgba(10,15,23,0.45)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 8px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-400/20 rounded-xl text-[13px] text-red-300 text-center">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-slate-400 mb-1.5 ml-1">用户名 *</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-[14px] bg-white/[0.06] border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/40 focus:bg-white/[0.10] focus:shadow-[0_0_20px_rgba(16,185,129,0.08)] transition-all"
                    placeholder="用户名" autoComplete="username" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-400 mb-1.5 ml-1">显示名</label>
                  <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-[14px] bg-white/[0.06] border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/40 focus:bg-white/[0.10] focus:shadow-[0_0_20px_rgba(16,185,129,0.08)] transition-all"
                    placeholder="可选" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-400 mb-1.5 ml-1">密码 *</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-[14px] bg-white/[0.06] border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/40 focus:bg-white/[0.10] focus:shadow-[0_0_20px_rgba(16,185,129,0.08)] transition-all"
                    placeholder="至少6位" autoComplete="new-password" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-400 mb-1.5 ml-1">确认密码 *</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-[14px] bg-white/[0.06] border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/40 focus:bg-white/[0.10] focus:shadow-[0_0_20px_rgba(16,185,129,0.08)] transition-all"
                    placeholder="再次输入" autoComplete="new-password" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-medium text-slate-400 mb-1.5 ml-1">手机号</label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-[14px] bg-white/[0.06] border border-white/[0.08] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/40 focus:bg-white/[0.10] focus:shadow-[0_0_20px_rgba(16,185,129,0.08)] transition-all"
                    placeholder="可选" autoComplete="tel" />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit" disabled={loading}
                  className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-white bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-500 hover:from-emerald-500 hover:via-emerald-400 hover:to-cyan-400 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35 transition-all disabled:opacity-50 active:scale-[0.98]"
                  style={{ backgroundSize: '200% auto', animation: 'gradientShift 4s ease infinite' }}
                >
                  {loading ? '提交中...' : '提交申请'}
                </button>
                <Link href="/login" className="text-[13px] text-slate-400 hover:text-emerald-400 transition-colors flex-shrink-0">
                  返回登录
                </Link>
              </div>
            </form>
          </div>
        </div>

        <p className="mt-8 text-[11px] text-slate-600">
          &copy; {new Date().getFullYear()} 聊心商学院 · IP 数据管理系统
        </p>
      </div>
    </div>
  );
}
