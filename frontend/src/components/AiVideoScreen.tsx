import { useState, useEffect, useRef } from 'react';
import { useAIVideoStore, type AIVideo } from '../store/AiVideoStore';

const TOPIC_PRESETS = [
  'Motivational quotes', 'Success mindset', 'Life hacks', 'Morning routine',
  'Self improvement', 'Entrepreneur grind', 'Positive affirmations', 'Workout motivation',
];
const STYLE_OPTIONS = [
  { value: 'cinematic',    label: 'Cinematic',    icon: '🎬' },
  { value: 'motivational', label: 'Motivational', icon: '⚡' },
  { value: 'documentary',  label: 'Documentary',  icon: '🎥' },
  { value: 'aesthetic',    label: 'Aesthetic',    icon: '✨' },
];
const DURATION_OPTIONS = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];
const PIPELINE = [
  { icon: '✍', label: 'Script' },
  { icon: '🎬', label: 'Video' },
  { icon: '📝', label: 'Title' },
  { icon: '🏷', label: 'Tags' },
  { icon: '▲', label: 'YouTube' },
];

const Spinner = () => (
  <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white/25 border-t-white" style={{ animation: 'spin 0.65s linear infinite' }} />
);

// ─── Inline API Key ────────────────────────────────────────────────
function InlineApiKeyField() {
  const { openaiKey, setOpenaiKey } = useAIVideoStore();
  const [show, setShow] = useState(false);
  const isValid = openaiKey.trim().startsWith('sk-') && openaiKey.trim().length > 10;

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-gray-400">OpenAI API Key</span>
        {isValid && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" /> Ready
          </span>
        )}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-gray-400">
        Required for GPT-4o + Sora generation. Stored locally in your browser only.{' '}
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-blue-500 underline hover:text-blue-600">Get a key ↗</a>
      </p>
      <div className="relative">
        <input
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 font-mono text-sm text-gray-800 outline-none placeholder:text-gray-300 transition-colors focus:border-red-400 focus:ring-1 focus:ring-red-100"
          type={show ? 'text' : 'password'}
          value={openaiKey}
          onChange={e => setOpenaiKey(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" tabIndex={-1} onClick={() => setShow(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 transition-colors hover:text-gray-600">
          {show ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  );
}

// ─── Preview Modal ─────────────────────────────────────────────────
function PreviewModal({ video, onClose }: { video: AIVideo; onClose: () => void }) {
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const { uploadToYouTube, uploadStates } = useAIVideoStore();
  const state = uploadStates[video.id];
  const isUploading = state?.loading;
  const isDone = state?.done || video.uploaded;
  const youtubeId = state?.youtubeId || video.youtubeId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: '92vh', animation: 'slideUp 0.2s ease' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500">
          ✕
        </button>
        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          {/* Video */}
          <div className="flex justify-center">
            <div className="w-full overflow-hidden rounded-xl bg-black shadow-lg" style={{ aspectRatio: '9/16' }}>
              <video className="h-full w-full object-cover" src={video.videoUrl} controls autoPlay playsInline loop />
            </div>
          </div>
          {/* Info */}
          <div className="flex min-w-0 flex-col gap-4">
            <span className="inline-flex w-fit items-center rounded border border-red-100 bg-red-50 px-2 py-1 font-mono text-xs font-bold tracking-widest text-red-600">AI GENERATED</span>
            <h3 className="text-xl font-bold leading-snug text-gray-900">{video.title}</h3>
            <p className="text-sm leading-relaxed text-gray-500">{video.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {video.tags.map(t => (
                <span key={t} className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-600">#{t}</span>
              ))}
            </div>
            <div className="rounded-r-lg border-l-4 border-red-500 bg-gray-50 px-4 py-3">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-gray-400">Script</p>
              <p className="text-sm italic leading-relaxed text-gray-600">{video.script}</p>
            </div>
            {!isDone ? (
              <div className="mt-auto space-y-3 pt-2">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Privacy</p>
                  <div className="flex gap-2">
                    {(['public', 'unlisted', 'private'] as const).map(p => (
                      <button key={p}
                        onClick={() => !isUploading && setPrivacy(p)}
                        disabled={isUploading}
                        className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${privacy === p ? 'border-red-600 bg-red-600 text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400'}`}
                      >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                    ))}
                  </div>
                </div>
                {state?.error && <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600"><span className="font-bold">!</span> {state.error}</div>}
                <button
                  onClick={() => !isUploading && uploadToYouTube(video.id, privacy)}
                  disabled={isUploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}
                >
                  {isUploading ? <><Spinner /> Uploading to YouTube…</> : <><span>▲</span> Upload to YouTube</>}
                </button>
              </div>
            ) : (
              <div className="mt-auto flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 pt-2">
                <span className="text-xl text-green-500">✓</span>
                <div>
                  <p className="text-sm font-bold text-green-700">Uploaded to YouTube!</p>
                  {youtubeId && <a href={`https://youtube.com/shorts/${youtubeId}`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline">View on YouTube ↗</a>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Video Card ────────────────────────────────────────────────────
function AIVideoCard({ video, index }: { video: AIVideo; index: number }) {
  const [hovered, setHovered]     = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (hovered) videoRef.current?.play().catch(() => {});
    else { videoRef.current?.pause(); if (videoRef.current) videoRef.current.currentTime = 0; }
  }, [hovered]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <div
        className={`overflow-hidden rounded-xl border bg-white transition-all duration-200 ${hovered ? '-translate-y-1 border-red-400 shadow-lg' : 'border-gray-200 shadow-sm'}`}
        style={{ animation: 'fadeUp 0.3s ease both', animationDelay: `${index * 0.05}s` }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="relative overflow-hidden bg-gray-900" style={{ aspectRatio: '9/16' }}>
          <video ref={videoRef} src={video.videoUrl} className="h-full w-full object-cover" muted playsInline loop preload="metadata" />
          <span className="absolute left-2 top-2 z-10 rounded bg-red-600 px-1.5 py-0.5 font-mono text-xs font-bold tracking-wider text-white">AI</span>
          {video.uploaded && <span className="absolute right-2 top-2 z-10 rounded bg-[#FF0000] px-1.5 py-0.5 font-mono text-xs font-bold text-white">YT</span>}
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${hovered ? 'bg-black/50' : 'pointer-events-none bg-transparent'}`}>
            <button
              onClick={e => { e.stopPropagation(); setShowPreview(true); }}
              className={`rounded-full bg-white px-4 py-1.5 text-xs font-bold text-gray-900 shadow transition-all duration-150 hover:bg-red-600 hover:text-white ${hovered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
            >▶ Preview</button>
          </div>
        </div>
        <div className="p-3">
          <p className="mb-2 line-clamp-2 text-xs font-semibold leading-snug text-gray-800">{video.title}</p>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="max-w-[7rem] truncate text-xs font-semibold text-red-500">#{video.topic}</span>
            <span className="text-xs text-gray-400">{fmtDate(video.createdAt)}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {video.tags.slice(0, 3).map(t => (
              <span key={t} className="rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-400">#{t}</span>
            ))}
          </div>
        </div>
      </div>
      {showPreview && <PreviewModal video={video} onClose={() => setShowPreview(false)} />}
    </>
  );
}

// ─── Generation Progress ───────────────────────────────────────────
function GenerationProgress() {
  const { generateJob, resetGenerateJob } = useAIVideoStore();
  if (!generateJob) return null;

  const stages = [
    { key: 'scripting',        label: 'Script & Metadata', sub: 'Writing with GPT-4o…' },
    { key: 'generating_video', label: 'Video Generation',  sub: 'Rendering with Sora…'  },
    { key: 'complete',         label: 'Complete',          sub: 'Done!'                  },
  ];
  const currentIdx = stages.findIndex(s => s.key === generateJob.stage);
  const isDone  = generateJob.status === 'done';
  const isError = generateJob.status === 'error';

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5" style={{ animation: 'fadeUp 0.25s ease' }}>
      <div className="mb-5 flex items-center justify-between">
        <span className="text-base font-bold text-gray-900">
          {isError ? '⚠ Generation Failed' : isDone ? '✓ Video Ready' : '⚙ Generating…'}
        </span>
        {(isDone || isError) && (
          <button onClick={resetGenerateJob} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-700">
            Dismiss
          </button>
        )}
      </div>
      <div className="mb-4 flex items-start">
        {stages.map((stage, i) => {
          const status =
            isError && i === currentIdx ? 'error'
            : i < currentIdx || isDone  ? 'done'
            : i === currentIdx          ? 'active'
            : 'pending';
          return (
            <div key={stage.key} className="relative flex flex-1 flex-col items-center text-center">
              {i < stages.length - 1 && (
                <div className={`absolute top-4 h-0.5 transition-colors ${i < currentIdx || isDone ? 'bg-green-400' : 'bg-gray-200'}`}
                  style={{ left: 'calc(50% + 16px)', right: 'calc(-50% + 16px)' }} />
              )}
              <div className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${
                status === 'done'   ? 'border-green-400 bg-green-50 text-green-600'
                : status === 'active' ? 'border-red-400 bg-red-50 text-red-600'
                : status === 'error'  ? 'border-red-300 bg-red-50 text-red-500'
                : 'border-gray-200 bg-gray-50 text-gray-400'
              }`}>
                {status === 'done'   ? '✓'
                 : status === 'error' ? '✕'
                 : status === 'active' ? <span className="block h-2 w-2 rounded-full bg-red-500" style={{ animation: 'blink 0.8s ease infinite' }} />
                 : ['✍','🎬','✓'][i]}
              </div>
              <div className="mt-2 px-1">
                <p className={`text-xs font-semibold ${status === 'active' || status === 'done' ? 'text-gray-800' : 'text-gray-400'}`}>{stage.label}</p>
                {status === 'active' && <p className="mt-0.5 text-xs text-red-500">{stage.sub}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {generateJob.script && (
        <div className="mt-2 rounded-r-lg border-l-4 border-red-500 bg-gray-50 px-4 py-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-400">Generated Script</p>
          <p className="text-sm leading-relaxed text-gray-700">{generateJob.script}</p>
          {generateJob.title && <p className="mt-2 text-sm font-bold text-red-600">"{generateJob.title}"</p>}
        </div>
      )}
      {generateJob.error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
          <span className="shrink-0 font-bold">!</span><span>{generateJob.error}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────
export default function AIVideoScreen() {
  const { startGenerate, generateJob, generateLoading, generateError, aiVideos, aiVideosLoading, fetchAIVideos } = useAIVideoStore();
  const [topic,    setTopic]    = useState('');
  const [style,    setStyle]    = useState('cinematic');
  const [duration, setDuration] = useState(30);
  const [focused,  setFocused]  = useState(false);

  useEffect(() => { fetchAIVideos(); }, [fetchAIVideos]);

  const isRunning = generateJob?.status === 'running' || generateLoading;
  const handleGenerate = async () => { if (isRunning || !topic.trim()) return; await startGenerate({ topic, style, duration }); };

  return (
    <div style={{ animation: 'fadeUp 0.25s ease' }}>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-[1.8rem] font-extrabold leading-[1.1] tracking-[-0.03em] text-gray-900" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            AI Video Creator
          </h2>
          <p className="mt-1 text-[0.82rem] text-gray-500">Generate original Shorts using GPT-4o + Sora — script, video, and metadata, all AI-powered.</p>
        </div>
      </div>

      <InlineApiKeyField />

      {/* Config card */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* Topic */}
        <div className="mb-4">
          <label className={`mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] transition-colors ${focused ? 'text-red-600' : 'text-gray-400'}`}>
            Video Topic / Niche
          </label>
          <input
            className={`w-full rounded-md border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 ${
              focused ? 'border-red-400 bg-white ring-1 ring-red-100' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
            }`}
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="e.g. Motivational quotes for entrepreneurs"
            disabled={isRunning}
          />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {TOPIC_PRESETS.map(p => (
              <button key={p}
                onClick={() => !isRunning && setTopic(p)}
                disabled={isRunning}
                className={`rounded-full border px-3 py-1 text-[0.72rem] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  topic === p
                    ? 'border-red-200 bg-red-50 font-semibold text-red-600'
                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600'
                }`}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* Style + Duration */}
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex-1">
            <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-gray-400">Visual Style</p>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map(s => (
                <button key={s.value}
                  onClick={() => !isRunning && setStyle(s.value)}
                  disabled={isRunning}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                    style === s.value ? 'border-red-400 bg-red-50 font-semibold text-red-600' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-800'
                  }`}
                ><span>{s.icon}</span>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="shrink-0">
            <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-gray-400">Duration</p>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map(d => (
                <button key={d.value}
                  onClick={() => !isRunning && setDuration(d.value)}
                  disabled={isRunning}
                  className={`rounded-lg border px-5 py-2 font-mono text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                    duration === d.value ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-700'
                  }`}
                >{d.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Pipeline */}
        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          {PIPELINE.map((item, i) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                <span>{item.icon}</span><span>{item.label}</span>
              </div>
              {i < PIPELINE.length - 1 && <span className="text-sm text-gray-300">→</span>}
            </div>
          ))}
        </div>

        {generateError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
            <span className="font-bold">!</span> {generateError}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isRunning || !topic.trim()}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 ${isRunning ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700 active:scale-[0.99]'}`}
          style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}
        >
          {isRunning ? <><Spinner /> Generating…</> : <><span>🤖</span> Generate AI Video</>}
        </button>
      </div>

      <GenerationProgress />

      {/* Skeletons */}
      {aiVideosLoading && aiVideos.length === 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-gray-200 bg-white" style={{ aspectRatio: '9/13' }}>
              <div className="h-full w-full animate-pulse bg-gray-100" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!aiVideosLoading && aiVideos.length === 0 && !generateJob && (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <span className="text-5xl opacity-40">🤖</span>
          <p className="text-lg font-bold text-gray-800" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>No AI videos yet</p>
          <p className="text-sm text-gray-400">Generate your first AI Short above — fully original and copyright-free.</p>
        </div>
      )}

      {/* Grid */}
      {aiVideos.length > 0 && (
        <>
          <div className="mb-3 mt-6 flex items-center gap-2">
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-gray-400">Generated Videos</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-400">{aiVideos.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {aiVideos.map((v, i) => <AIVideoCard key={v.id} video={v} index={i} />)}
          </div>
        </>
      )}
    </div>
  );
}