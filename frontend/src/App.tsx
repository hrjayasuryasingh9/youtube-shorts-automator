import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from './store/authStore';
import { useUploadStore } from './store/uploadStore';
import { useCountUp } from './hooks/useCountUp';
import AutoUploadScreen from './components/AutoUploadScreen';
import UploadByLinkScreen from './components/Uploadbylinkscreen ';
import VideosScreen from './components/Videosscreen';
import AIVideoScreen from './components/AiVideoScreen';
import './index.css';

type Tab = 'auto' | 'link' | 'videos' | 'ai';
const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id: 'auto',   icon: '⚡', label: 'Auto Upload', desc: 'Find & upload trending Shorts' },
  { id: 'link',   icon: '↑',  label: 'By Link',     desc: 'Upload any YouTube video'      },
  { id: 'videos', icon: '▶',  label: 'My Videos',   desc: 'View uploaded library'         },
  { id: 'ai',     icon: '🤖', label: 'AI Creator',  desc: 'Generate Shorts with GPT+Sora' },
];

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-red-600 font-extrabold text-white"
      style={{ width: size, height: size, fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: size * 0.5 }}
    >S</span>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="text-lg font-bold text-white" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>ShortsBot</span>
        </div>
        <div className="w-40 overflow-hidden rounded-sm bg-[#1f1f1f]" style={{ height: 2 }}>
          <div className="h-full w-2/5 rounded-sm bg-red-600" style={{ animation: 'loadSlide 1.2s ease-in-out infinite' }} />
        </div>
        <p className="text-xs uppercase tracking-[0.12em] text-[#525252]">Connecting…</p>
      </div>
    </div>
  );
}

function LoginScreen() {
  const { login, isLoggingIn, loginError, error, hasClientSecret, checkAuth } = useAuthStore();
  const serverDown = !!error;
  const divider = <div className="my-6 h-px bg-[#222]" />;

  const step = (n: number, text: React.ReactNode) => (
    <div key={n} className="mb-2 flex items-start gap-2.5">
      <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[#333] text-[0.65rem] font-bold text-[#525252]">{n}</span>
      <span className="text-[0.79rem] leading-relaxed text-white/60">{text}</span>
    </div>
  );
  const code = (s: string) => (
    <code className="rounded bg-red-600/10 px-1.5 py-0.5 font-mono text-[0.78rem] text-red-400">{s}</code>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d0d1a] p-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/5 p-9 shadow-[0_40px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <LogoMark size={46} />
          <div>
            <div className="text-lg font-bold text-white" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>ShortsBot</div>
            <div className="text-[0.72rem] uppercase tracking-[0.07em] text-white/40">YouTube Automation</div>
          </div>
        </div>
        {divider}
        {serverDown ? (
          <>
            <div className="mb-5 flex gap-2.5 rounded-xl border border-red-800/40 bg-red-900/20 p-3.5">
              <span className="text-lg text-red-400">⚠</span>
              <div>
                <p className="mb-0.5 text-sm font-semibold text-red-300">Server unreachable</p>
                <p className="text-xs text-white/40">{error}</p>
              </div>
            </div>
            <div className="mb-5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="mb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white/40">Start the server</p>
              {step(1, <>{code('uvicorn main:app --reload')}</>)}
              {step(2, <>Must run on {code('http://localhost:8000')}</>)}
            </div>
            <button onClick={() => checkAuth(true)} className="w-full rounded-xl border border-white/10 bg-white/[0.07] py-3 text-sm font-medium text-white transition-colors hover:bg-white/10">
              ↻ Retry Connection
            </button>
          </>
        ) : (
          <>
            {!hasClientSecret && (
              <div className="mb-5 flex gap-2.5 rounded-xl border border-red-800/40 bg-red-900/20 p-3.5">
                <span className="text-red-400">⚠</span>
                <div className="text-sm leading-relaxed text-red-300">
                  <strong>client_secret.json</strong> not found.<br />
                  <span className="text-xs text-white/40">Download from Google Cloud Console → APIs & Services → Credentials.</span>
                </div>
              </div>
            )}
            <div className="mb-6">
              <h2 className="mb-1.5 text-base font-bold text-white" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>Sign in with Google</h2>
              <p className="text-[0.8rem] leading-relaxed text-white/45">Connect your YouTube channel to start automating Shorts uploads.</p>
            </div>
            {loginError && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-800/40 bg-red-900/20 px-3 py-2.5 text-sm text-red-300">
                <span className="shrink-0">⚠</span> {loginError}
              </div>
            )}
            <button
              onClick={login}
              disabled={isLoggingIn || !hasClientSecret}
              className="flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: isLoggingIn ? 'rgba(255,255,255,0.06)' : '#fff',
                color: isLoggingIn ? 'rgba(255,255,255,0.6)' : '#3c4043',
                borderColor: isLoggingIn ? 'rgba(255,255,255,0.1)' : '#dadce0',
              }}
            >
              {isLoggingIn ? (
                <>
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-white/20 border-t-white/70" style={{ animation: 'spin 0.7s linear infinite' }} />
                  Waiting for Google…
                </>
              ) : (
                <><GoogleIcon /> Continue with Google</>
              )}
            </button>
            <p className="mt-2.5 text-center text-[0.72rem] leading-relaxed text-white/25">
              A popup will open. Allow popups for this page if prompted.
            </p>
            {divider}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white/40">First time? One-time setup</p>
              {step(1, <>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-blue-400 underline">Google Cloud Console</a> → Create a project</>)}
              {step(2, <>Enable <strong className="text-white/75">YouTube Data API v3</strong></>)}
              {step(3, <>Credentials → Create <strong className="text-white/75">OAuth 2.0 Client ID</strong> → type: Web application</>)}
              {step(4, <>Add redirect URI: {code('http://localhost:8000/auth/callback')}</>)}
              {step(5, <>Download JSON → rename to {code('client_secret.json')} → place next to {code('main.py')}</>)}
              {step(6, <>Run: {code('uvicorn main:app --reload')} then click above</>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, isChecking, checkAuth, logout, isLoggingOut, activeJobs, totalUploaded } = useAuthStore();
  const { autoJob, linkJob, fetchVideos } = useUploadStore();
  const [tab, setTab]               = useState<Tab>('auto');
  const [sidebarW, setSidebarW]     = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const dragRef = useRef<number>(0);
  const animUploaded = useCountUp(totalUploaded);
  const animActive   = useCountUp(activeJobs);

  useEffect(() => { checkAuth(true); }, [checkAuth]);
  useEffect(() => { const t = setInterval(() => checkAuth(false), 30_000); return () => clearInterval(t); }, [checkAuth]);
  useEffect(() => { if (isAuthenticated) fetchVideos(); }, [isAuthenticated, fetchVideos]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = e.clientX - sidebarW;
    setIsResizing(true);
    const onMove = (ev: MouseEvent) => setSidebarW(Math.min(400, Math.max(180, ev.clientX - dragRef.current)));
    const onUp = () => { setIsResizing(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sidebarW]);

  if (isChecking) return <Splash />;
  if (!isAuthenticated) return <LoginScreen />;

  const autoRunning = autoJob?.status === 'running';
  const linkRunning = linkJob?.status === 'running';

  return (
    <div className={`relative flex min-h-screen ${isResizing ? 'cursor-col-resize [&_*]:pointer-events-none' : ''}`}>
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-[100] flex h-screen flex-col overflow-hidden bg-[#0a0a0a]" style={{ width: sidebarW }}>
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[#161616] px-4 py-5">
          <LogoMark size={32} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[0.95rem] font-bold text-white" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>ShortsBot</span>
            <span className="truncate text-[0.65rem] text-[#404040]">YouTube Automation</span>
          </div>
        </div>
        {/* Stats */}
        <div className="flex shrink-0 border-b border-[#161616]">
          {[
            { n: animUploaded, l: 'Total uploads', live: false },
            { n: animActive,   l: 'Active jobs',   live: activeJobs > 0 },
          ].map(({ n, l, live }) => (
            <div key={l} className="flex flex-1 flex-col gap-px border-r border-[#161616] px-4 py-3 last:border-r-0">
              <span
                className="text-[1.4rem] font-extrabold leading-none"
                style={{ fontFamily: "'Bricolage Grotesque',sans-serif", color: live ? '#DC2626' : '#fff', ...(live ? { animation: 'statPulse 1.5s ease infinite' } : {}) }}
              >{n}</span>
              <span className="truncate text-[0.62rem] font-medium uppercase tracking-[0.08em] text-[#404040]">{l}</span>
            </div>
          ))}
        </div>
        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const hasDot = (t.id === 'auto' && autoRunning) || (t.id === 'link' && linkRunning);
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${active ? 'bg-red-600 text-white' : 'text-[#525252] hover:bg-[#141414] hover:text-[#a3a3a3]'}`}
              >
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[5px] text-[0.9rem]" style={{ background: active ? 'rgba(255,255,255,0.18)' : '#141414' }}>
                  {t.icon}
                </span>
                <span className="flex min-w-0 flex-col overflow-hidden">
                  <span className="truncate text-[0.82rem] font-medium">{t.label}</span>
                  {sidebarW > 200 && <span className="truncate text-[0.62rem] opacity-60">{t.desc}</span>}
                </span>
                {hasDot && <span className="absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white" style={{ animation: 'blink 1s ease infinite' }} />}
              </button>
            );
          })}
        </nav>
        {/* Footer */}
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-[#161616] px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-[0.68rem] uppercase tracking-[0.08em] text-[#404040]">Connected</span>
          </div>
          {!showLogout ? (
            <button onClick={() => setShowLogout(true)} className="w-fit py-1 text-[0.75rem] font-medium text-[#525252] transition-colors hover:text-red-500">Sign out</button>
          ) : (
            <div className="flex items-center gap-1.5 text-[0.75rem] text-[#525252]" style={{ animation: 'fadeUp 0.15s ease' }}>
              <span>Sure?</span>
              <button onClick={async () => { setShowLogout(false); await logout(); }} disabled={isLoggingOut}
                className="rounded bg-red-600 px-2 py-0.5 text-[0.72rem] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60">
                {isLoggingOut ? <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/30 border-t-white" style={{ animation: 'spin 0.7s linear infinite' }} /> : 'Yes'}
              </button>
              <button onClick={() => setShowLogout(false)} className="rounded border border-[#222] px-2 py-0.5 text-[0.72rem] transition-colors hover:border-[#444] hover:text-white">No</button>
            </div>
          )}
        </div>
      </aside>

      {/* Resize handle */}
      <div
        className={`fixed top-0 z-[200] h-screen w-1.5 cursor-col-resize transition-colors hover:bg-red-600/60 ${isResizing ? 'bg-red-600/60' : ''}`}
        style={{ left: sidebarW - 3 }}
        onMouseDown={onDragStart}
      />

      {/* Main */}
      <main className="flex-1 min-h-screen max-w-full px-10 pb-16 pt-8" style={{ marginLeft: sidebarW }}>
        {tab === 'auto'   && <AutoUploadScreen />}
        {tab === 'link'   && <UploadByLinkScreen />}
        {tab === 'videos' && <VideosScreen />}
        {tab === 'ai'     && <AIVideoScreen />}
      </main>
    </div>
  );
}