import { useState, type FormEvent } from 'react';
import { Lock, ArrowRight } from 'lucide-react';

import { login } from '../lib/api';

interface LoginPageProps {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('请输入密码');
      triggerShake();
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg p-4">
      {/* Subtle dot pattern background */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.08] dark:opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(rgb(var(--color-ink)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(circle at center, black, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 80%)',
        }}
      />

      {/* Background glow orbs */}
      <div
        className="pointer-events-none absolute -left-32 -top-24 h-[420px] w-[420px] rounded-full opacity-[0.07] blur-[100px] dark:opacity-[0.04]"
        style={{ background: 'rgb(var(--color-accent))' }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 right-[-10%] h-[360px] w-[360px] rounded-full opacity-[0.06] blur-[90px] dark:opacity-[0.03]"
        style={{ background: 'rgb(var(--color-violet, var(--color-accent)))' }}
      />
      <div
        className="pointer-events-none absolute left-[40%] top-[60%] h-[280px] w-[280px] rounded-full opacity-[0.04] blur-[80px] dark:opacity-[0.02]"
        style={{ background: 'rgb(var(--color-status-ok))' }}
      />

      <div className="relative z-10 w-full max-w-[380px]">
        {/* Brand area */}
        <div className="mb-12 animate-heroTitleEnter text-center">
          <div className="relative mx-auto mb-6 h-[80px] w-[80px]">
            <div className="absolute inset-0 animate-pulseDot rounded-2xl bg-accent/20 blur-xl" />
            <img
              src="/medkit-icon-rounded.png"
              alt="MedKit"
              className="relative z-10 h-full w-full rounded-[20px] bg-white shadow-card transition-transform duration-500 hover:scale-105"
            />
          </div>
          <h1 className="font-display text-[34px] font-light tracking-tight text-ink">
            OpenMedKit
          </h1>
          {/* <div className="mx-auto mt-4 h-px w-12 bg-gradient-to-r from-transparent via-accent/40 to-transparent" /> */}
          <p className="mt-4 font-mono text-[12px] tracking-[0.2em] text-ink3">
            AI-POWERED MEDICINE MANAGER
          </p>
        </div>

        {/* Form card */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className={`animate-searchBarEnter rounded-[20px] border border-white/40 bg-surface/70 p-7 shadow-panel backdrop-blur-xl dark:border-white/10 dark:bg-surface/40 ${
            shaking ? 'animate-shake' : ''
          }`}
        >
          <label className="block">
            <span className="mb-2 block text-[13px] font-medium text-ink2">访问密码</span>
            <div className="group relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-ink3 transition-colors group-focus-within:text-accent" />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="输入密码以继续"
                autoFocus
                className="theme-input w-full rounded-[12px] border border-border/60 bg-surface/50 py-3 pl-10 pr-4 text-[15px] outline-none transition-all placeholder:text-ink3/50 focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/10 dark:bg-surface2/30"
              />
            </div>
          </label>

          {error && (
            <div className="mt-3 flex items-center gap-1.5 text-[13px] text-status-danger">
              <div className="h-1.5 w-1.5 rounded-full bg-status-danger" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className={`group mt-6 flex w-full items-center justify-center gap-2 rounded-[12px] bg-accent py-3 text-[14px] font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 ${
              !loading && password.trim() ? 'animate-softGlow' : ''
            }`}
          >
            {loading ? '验证中…' : '进入药箱'}
            {!loading && (
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-8 text-center font-mono text-[10px] tracking-wide text-ink3/60">
          Made by @sensh85
        </p>
      </div>
    </div>
  );
}
