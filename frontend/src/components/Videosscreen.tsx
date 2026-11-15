import { useEffect, useState, useCallback } from 'react';
import { useUploadStore } from '../store/uploadStore';
import { useYtApiStore, fetchYouTubeStats, type VideoStats } from '../store/ytApiStore';

const fmt = (s: number) => {
  if (!s) return '';
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` : `0:${s.toString().padStart(2, '0')}`;
};
const fmtDate = (iso: string) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtNum = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
};

type Sort = 'newest' | 'oldest' | 'most_views' | 'most_likes';

// ─── YouTube API Key Modal ─────────────────────────────────────────
function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const { apiKey, setApiKey } = useYtApiStore();
  const [draft, setDraft]   = useState(apiKey);
  const [showKey, setShowKey] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ animation: 'fadeUp 0.15s ease' }}
      onClick={onClose}
    >
      <div
        className="w-[min(480px,92vw)] rounded-xl border border-white/10 bg-[#1a1a2e] p-7 shadow-2xl"
        style={{ animation: 'slideUp 0.2s ease' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Head */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-bold text-white">YouTube Data API Key</span>
          <button onClick={onClose} className="rounded px-1.5 py-0.5 text-sm text-white/50 transition-opacity hover:text-white/90">✕</button>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-white/55">
          Required to load views, likes, and comments. Stored locally in your browser — never sent to any server.
        </p>

        {/* Steps */}
        <div className="mb-5">
          <p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-white/45">How to get your API key:</p>
          {[
            <>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="underline text-white/80">Google Cloud Console</a></>,
            <>Create a project → Enable <strong className="text-white/80">YouTube Data API v3</strong></>,
            <>Go to <strong className="text-white/80">APIs &amp; Services → Credentials → Create API Key</strong></>,
            <>Paste the key below</>,
          ].map((text, i) => (
            <div key={i} className="mb-1.5 flex items-start gap-3 text-xs text-white/65">
              <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-white/20 text-[0.65rem] font-bold text-white/45">{i + 1}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="mb-5 flex items-center gap-2">
          <input
            className="flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-white/20 focus:border-red-500"
            type={showKey ? 'text' : 'password'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="AIza…"
            autoFocus
          />
          <button
            onClick={() => setShowKey(v => !v)}
            className="rounded border border-white/15 px-2 py-2 text-sm text-white/50 transition-colors hover:text-white"
          >{showKey ? '🙈' : '👁'}</button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/55 transition-all hover:border-white/30 hover:text-white/80"
          >Cancel</button>
          <button
            onClick={() => { setApiKey(draft.trim()); onClose(); }}
            disabled={!draft.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}
          >Save Key</button>
        </div>
      </div>
    </div>
  );
}

// ─── Ghost button helper ───────────────────────────────────────────
const GhostBtn = ({ onClick, disabled, children, title }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-all hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {children}
  </button>
);

const Spinner = ({ sm }: { sm?: boolean }) => (
  <span
    className={`inline-block shrink-0 rounded-full border-2 ${sm ? 'h-2.5 w-2.5 border-gray-200 border-t-gray-500' : 'h-3.5 w-3.5 border-white/25 border-t-white'}`}
    style={{ animation: 'spin 0.65s linear infinite' }}
  />
);

// ─── Main screen ──────────────────────────────────────────────────
export default function VideosScreen() {
  const { videos, videosLoading, videosError, fetchVideos } = useUploadStore();
  const { apiKey } = useYtApiStore();
  const [sort, setSort]           = useState<Sort>('newest');
  const [search, setSearch]       = useState('');
  const [hoverId, setHoverId]     = useState<string | null>(null);
  const [showApiModal, setShowApiModal] = useState(false);

  const [stats, setStats]           = useState<Record<string, VideoStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError]   = useState<string | null>(null);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const loadStats = useCallback(async () => {
    if (!apiKey || !videos.length) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const ids = videos.map(v => v.newId).filter(Boolean);
      const result = await fetchYouTubeStats(ids, apiKey);
      setStats(result);
    } catch (err: unknown) {
      setStatsError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally { setStatsLoading(false); }
  }, [apiKey, videos]);

  useEffect(() => { if (apiKey && videos.length) loadStats(); }, [apiKey, videos.length, loadStats]);

  const hasStats = Object.keys(stats).length > 0;

  const filtered = videos
    .filter(v => v.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'newest') return b.uploadedAt > a.uploadedAt ? 1 : -1;
      if (sort === 'oldest') return a.uploadedAt > b.uploadedAt ? 1 : -1;
      if (sort === 'most_views') return (stats[b.newId]?.viewCount ?? 0) - (stats[a.newId]?.viewCount ?? 0);
      if (sort === 'most_likes') return (stats[b.newId]?.likeCount ?? 0) - (stats[a.newId]?.likeCount ?? 0);
      return 0;
    });

  return (
    <div style={{ animation: 'fadeUp 0.25s ease' }}>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-[1.8rem] font-extrabold leading-[1.1] tracking-[-0.03em] text-gray-900" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            My Videos
          </h2>
          <p className="mt-1 text-[0.82rem] text-gray-500">
            {videos.length > 0 ? `${videos.length} video${videos.length !== 1 ? 's' : ''} uploaded` : 'No uploads yet.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {apiKey ? (
            <GhostBtn onClick={loadStats} disabled={statsLoading} title="Refresh stats from YouTube">
              {statsLoading ? <Spinner sm /> : '📊'}&nbsp;{statsLoading ? 'Loading…' : 'Refresh Stats'}
            </GhostBtn>
          ) : (
            <GhostBtn onClick={() => setShowApiModal(true)}>🔑 Add API Key</GhostBtn>
          )}
          {apiKey && (
            <button
              onClick={() => setShowApiModal(true)}
              title="Update API key"
              className="rounded border border-gray-200 px-2 py-1.5 text-[0.72rem] text-gray-500 transition-all hover:border-red-200 hover:text-red-600"
            >🔑</button>
          )}
          <GhostBtn onClick={fetchVideos} disabled={videosLoading}>
            {videosLoading ? <Spinner sm /> : '↻'}&nbsp;Refresh
          </GhostBtn>
        </div>
      </div>

      {/* Stats error */}
      {statsError && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <span className="shrink-0 font-bold">!</span>
          <span>Stats error: {statsError} — check your API key.</span>
          <button onClick={() => setShowApiModal(true)} className="ml-2 rounded border border-red-200 px-2 py-0.5 text-[0.72rem] text-red-700 transition-colors hover:bg-red-100">
            Update Key
          </button>
        </div>
      )}

      {/* No-key nudge */}
      {!apiKey && videos.length > 0 && (
        <div
          onClick={() => setShowApiModal(true)}
          className="mb-5 flex cursor-pointer items-center gap-4 rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-3.5 transition-all hover:border-yellow-300 hover:bg-yellow-100"
        >
          <span className="shrink-0 text-2xl">📊</span>
          <div className="flex-1">
            <p className="mb-0.5 text-sm font-semibold text-gray-900">See views, likes & comments</p>
            <p className="text-xs text-gray-500">Add a free YouTube Data API key to unlock live stats for every video.</p>
          </div>
          <span className="text-lg text-gray-400">→</span>
        </div>
      )}

      {/* Search + sort controls */}
      {videos.length > 0 && (
        <div className="mb-5 flex items-center gap-3">
          <input
            className="max-w-xs flex-1 appearance-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-red-500 focus:bg-white"
            placeholder="Search videos…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex overflow-hidden rounded-md border border-gray-200 bg-white">
            {(['newest', 'oldest'] as Sort[]).concat(hasStats ? ['most_views', 'most_likes'] as Sort[] : []).map(s => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`px-3 py-1.5 text-xs font-medium transition-all ${
                  sort === s ? 'bg-red-600 font-semibold text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {s === 'newest' ? 'Newest' : s === 'oldest' ? 'Oldest' : s === 'most_views' ? 'Most Views' : 'Most Liked'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fetch error */}
      {videosError && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <span className="shrink-0 font-bold">!</span> {videosError}
        </div>
      )}

      {/* Skeleton */}
      {videosLoading && videos.length === 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="relative overflow-hidden rounded-xl border border-gray-200 bg-white" style={{ aspectRatio: '9/13' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/[0.04] to-transparent" style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!videosLoading && filtered.length === 0 && !videosError && (
        <div className="py-16 text-center">
          <div className="mb-3 text-4xl opacity-50">🎬</div>
          <p className="mb-1 text-lg font-bold text-gray-900" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            {search ? 'No results' : 'No uploads yet'}
          </p>
          <p className="text-sm text-gray-400">
            {search ? 'Try a different search term.' : 'Use Auto Upload or Upload by Link to get started.'}
          </p>
        </div>
      )}

      {/* Video grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {filtered.map((v, i) => {
            const s = stats[v.newId];
            const hovered = hoverId === v.newId;
            return (
              <a
                key={v.newId}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className={`block overflow-hidden rounded-xl border bg-white transition-all ${hovered ? '-translate-y-0.5 border-gray-300' : 'border-gray-200'}`}
                style={{ animation: 'fadeUp 0.25s ease both', animationDelay: `${i * 0.04}s` }}
                onMouseEnter={() => setHoverId(v.newId)}
                onMouseLeave={() => setHoverId(null)}
              >
                {/* Thumb */}
                <div className="relative overflow-hidden bg-gray-100" style={{ aspectRatio: '9/16' }}>
                  {v.thumbnail
                    ? <img src={v.thumbnail} alt={v.title} className={`h-full w-full object-cover transition-transform duration-200 ${hovered ? 'scale-[1.03]' : ''}`} />
                    : <div className="flex h-full w-full items-center justify-center text-2xl text-gray-300">▶</div>
                  }
                  {v.durationSeconds > 0 && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.65rem] text-white">
                      {fmt(v.durationSeconds)}
                    </span>
                  )}
                  <div className={`absolute inset-0 flex items-center justify-center transition-colors ${hovered ? 'bg-red-600/30' : 'bg-transparent'}`}>
                    <span className={`text-[0.78rem] font-bold text-white transition-all duration-150 ${hovered ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}>
                      ▶ Open
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-2.5">
                  <p className="mb-1.5 line-clamp-2 text-[0.78rem] font-semibold leading-snug text-gray-900">{v.title}</p>

                  {/* Live stats */}
                  {s && (
                    <div className="my-1.5 flex gap-2">
                      {[
                        { icon: '👁', n: s.viewCount,    title: 'Views'    },
                        { icon: '👍', n: s.likeCount,    title: 'Likes'    },
                        { icon: '💬', n: s.commentCount, title: 'Comments' },
                      ].map(({ icon, n, title }) => (
                        <span key={title} className="flex items-center gap-0.5 text-[0.72rem] font-semibold" title={title}>
                          <span className="text-[0.65rem] opacity-70">{icon}</span>
                          {fmtNum(n)}
                        </span>
                      ))}
                    </div>
                  )}
                  {statsLoading && !s && apiKey && (
                    <div className="my-1 flex items-center gap-1.5 text-[0.72rem] text-gray-400">
                      <Spinner sm /> Loading stats…
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[0.65rem] text-gray-400">{fmtDate(v.uploadedAt)}</span>
                    <code className="max-w-[80px] truncate rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-mono text-[0.55rem] text-gray-400">{v.newId}</code>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {showApiModal && <ApiKeyModal onClose={() => setShowApiModal(false)} />}
    </div>
  );
}