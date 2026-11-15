import { useState, useEffect, useRef } from 'react';
import { useUploadStore } from '../store/uploadStore';
import JobStatusPanel from './Jobstatuspanel ';

const extractId = (url: string) => {
  const pats = [
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of pats) { const m = url.trim().match(p); if (m) return m[1]; }
  return null;
};

export default function UploadByLinkScreen() {
  const { linkJob, linkLoading, linkError, startUploadByLink, resetLinkJob } = useUploadStore();
  const [url, setUrl]         = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [pasted, setPasted]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isRunning = linkJob?.status === 'running' || linkLoading;
  const videoId   = extractId(url);

  useEffect(() => {
    if (pasted) { const t = setTimeout(() => setPasted(false), 1200); return () => clearTimeout(t); }
  }, [pasted]);

  const handleSubmit = async () => {
    if (!url.trim() || isRunning) return;
    await startUploadByLink(url.trim(), privacy);
  };

  const isDuplicate = linkError?.toLowerCase().includes('already');

  return (
    <div style={{ animation: 'fadeUp 0.25s ease' }}>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-[1.8rem] font-extrabold leading-[1.1] tracking-[-0.03em] text-gray-900" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            Upload by Link
          </h2>
          <p className="mt-1 text-[0.82rem] text-gray-500">Paste a YouTube URL or video ID to re-upload to your channel.</p>
        </div>
      </div>

      {/* Card */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">

        {/* URL field */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-gray-400">
            YouTube URL or Video ID
          </label>
          <div
            className={`flex overflow-hidden rounded-md border transition-colors ${
              pasted ? 'border-green-500 bg-white'
              : url   ? 'border-gray-200 bg-white focus-within:border-red-500'
              : 'border-gray-200 bg-gray-50 focus-within:border-red-500 focus-within:bg-white'
            }`}
          >
            <div className="border-r border-gray-200 bg-gray-200 px-2.5 py-2 font-mono text-[0.72rem] font-medium text-gray-500 whitespace-nowrap">
              yt
            </div>
            <input
              ref={inputRef}
              className="flex-1 min-w-0 border-none bg-transparent px-3 py-2 text-sm text-gray-900 outline-none disabled:opacity-40"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onPaste={() => setPasted(true)}
              placeholder="https://youtube.com/shorts/… or video ID"
              disabled={isRunning}
            />
            {url && (
              <button
                onClick={() => { setUrl(''); inputRef.current?.focus(); }}
                disabled={isRunning}
                className="px-2.5 text-xs text-gray-400 transition-colors hover:text-red-600"
              >✕</button>
            )}
          </div>
        </div>

        {/* ID badge */}
        {videoId && (
          <div
            className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2"
            style={{ animation: 'fadeUp 0.15s ease' }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-600" />
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-green-700">Video ID detected</span>
            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.78rem] text-gray-900">{videoId}</code>
            <a
              href={`https://youtube.com/shorts/${videoId}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-[0.72rem] font-semibold text-green-700 transition-opacity hover:opacity-70"
            >Preview ↗</a>
          </div>
        )}

        {/* Privacy selector */}
        <div className="mb-4 mt-1">
          <label className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-gray-400">Privacy</label>
          <div className="flex gap-1.5">
            {(['public', 'unlisted', 'private'] as const).map(p => (
              <button
                key={p}
                onClick={() => !isRunning && setPrivacy(p)}
                disabled={isRunning}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[0.78rem] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  privacy === p
                    ? 'border-red-300 bg-red-50 font-semibold text-red-600'
                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-red-300 hover:text-red-600'
                }`}
              >
                <span className="h-1 w-1 rounded-full bg-current opacity-60" />
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {linkError && (
          <div
            className={`mb-3 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${
              isDuplicate
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            <span className="shrink-0 font-bold">{isDuplicate ? '↺' : '!'}</span>
            {isDuplicate ? 'This video has already been uploaded — duplicates are blocked.' : linkError}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isRunning || !url.trim()}
          className={`mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
            isRunning ? 'bg-gray-800' : 'bg-red-600 hover:bg-red-700 hover:-translate-y-px active:translate-y-0'
          }`}
          style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}
        >
          {isRunning ? (
            <>
              <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white/25 border-t-white" style={{ animation: 'spin 0.65s linear infinite' }} />
              Uploading…
            </>
          ) : (
            <><span className="text-base">↑</span> Upload Video</>
          )}
        </button>
      </div>

      {linkJob && <JobStatusPanel job={linkJob} onReset={resetLinkJob} />}
    </div>
  );
}