'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/lib/UserContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError('请输入用户名和密码'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '登录失败'); return; }
      login(data.user);
      router.push('/');
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background image */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: 'url(/login-bg-new.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Dark overlay for readability */}
      <div className="fixed inset-0 z-[1] bg-[#080c14]/60" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-4">
        {/* Logo + Title */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold text-white tracking-[0.12em]">
            聊心商学院 IP 数据管理系统
          </h1>
          <p className="text-[12px] text-slate-400 mt-2 tracking-[0.06em]">
            统一管理学员 IP · 平台账号 · 内容素材 · 运营数据
          </p>
        </div>

        {/* Login form card */}
        <div className="relative w-full max-w-sm animate-fade-up">
          {/* Avatar above the card — like the reference design */}
          <div className="flex justify-center mb-[-28px] relative z-20">
            <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-emerald-500/25 border-[3px] border-white/15"
              style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>

          {/* Glass card */}
          <div className="p-7 pt-10 rounded-3xl"
            style={{
              background: 'rgba(10, 15, 23, 0.45)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 8px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-400/20 rounded-xl text-[13px] text-red-300 text-center">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 ml-1 tracking-wider uppercase">Username</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <input
                    type="text" value={username} onChange={e => setUsername(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-[13px] bg-white/[0.06] border border-white/[0.08] text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400/40 focus:bg-white/[0.10] focus:shadow-[0_0_20px_rgba(16,185,129,0.08)] transition-all"
                    placeholder="请输入用户名" autoComplete="username"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 ml-1 tracking-wider uppercase">Password</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-[13px] bg-white/[0.06] border border-white/[0.08] text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400/40 focus:bg-white/[0.10] focus:shadow-[0_0_20px_rgba(16,185,129,0.08)] transition-all"
                    placeholder="请输入密码" autoComplete="current-password"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-600 hover:from-emerald-500 hover:via-emerald-400 hover:to-cyan-500 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35 transition-all disabled:opacity-50 active:scale-[0.98] tracking-wider"
              >
                {loading ? '登录中...' : '登 录 系 统'}
              </button>
            </form>
            <div className="mt-4 pt-4 border-t border-white/[0.06] text-center">
              <Link href="/register" className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors tracking-wider">
                没有账号？申请注册
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-[10px] text-slate-600 tracking-[0.12em] mt-8">
          &copy; {new Date().getFullYear()} 聊心商学院
        </p>
      </div>
    </div>
  );
}
