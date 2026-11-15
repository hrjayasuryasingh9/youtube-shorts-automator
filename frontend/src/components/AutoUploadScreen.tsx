import { useState } from 'react';
import { useUploadStore } from '../store/uploadStore';
import JobStatusPanel from './Jobstatuspanel ';

const QUERY_PRESETS = [
  'motivational quotes', 'funny moments', 'life hacks', 'satisfying videos',
  'cute animals', 'cooking tips', 'workout routines', 'travel reels',
];

// Shared field label
const FieldLabel = ({ children, focused }: { children: React.ReactNode; focused: boolean }) => (
  <label className={`mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] transition-colors ${focused ? 'text-red-600' : 'text-gray-400'}`}>
    {children}
  </label>
);

// Shared text/select input
const inputCls = 'w-full appearance-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-red-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-40';

// Number stepper
function NumberStepper({
  value, min, max, step = 1, disabled,
  onChange, focused, onFocus, onBlur,
}: {
  value: number; min: number; max: number; step?: number;
  disabled: boolean; onChange: (v: number) => void;
  focused: boolean; onFocus: () => void; onBlur: () => void;
}) {
  return (
    <div className={`flex overflow-hidden rounded-md border transition-colors ${focused ? 'border-red-500 bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <button
        onClick={() => !disabled && onChange(Math.max(min, value - step))}
        disabled={disabled}
        className="border-r border-gray-200 px-3 py-2 text-base text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
      >−</button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        className="flex-1 min-w-0 border-none bg-transparent py-2 px-1 text-center text-sm font-semibold outline-none disabled:opacity-40"
      />
      <button
        onClick={() => !disabled && onChange(Math.min(max, value + step))}
        disabled={disabled}
        className="border-l border-gray-200 px-3 py-2 text-base text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
      >+</button>
    </div>
  );
}

export default function AutoUploadScreen() {
  const { autoJob, autoLoading, autoError, startAutoUpload, resetAutoJob } = useUploadStore();
  const [query, setQuery]       = useState('motivational quotes');
  const [count, setCount]       = useState(5);
  const [minViews, setMinViews] = useState(1_000_000);
  const [daysBack, setDaysBack] = useState(7);
  const [delay, setDelay]       = useState(30);
  const [focused, setFocused]   = useState<string | null>(null);

  const isRunning = autoJob?.status === 'running' || autoLoading;

  const handleSubmit = async () => {
    if (isRunning || !query.trim()) return;
    await startAutoUpload({ query, count, minViews, daysBack, delaySeconds: delay });
  };

  return (
    <div style={{ animation: 'fadeUp 0.25s ease' }}>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-[1.8rem] font-extrabold leading-[1.1] tracking-[-0.03em] text-gray-900" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            Auto Upload
          </h2>
          <p className="mt-1 text-[0.82rem] text-gray-500">Find trending copyright-safe Shorts and upload automatically.</p>
        </div>
      </div>

      {/* Card */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">

        {/* Search query */}
        <div className="mb-4">
          <FieldLabel focused={focused === 'query'}>Search Query</FieldLabel>
          <input
            className={inputCls}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused('query')}
            onBlur={() => setFocused(null)}
            placeholder="e.g. motivational quotes"
            disabled={isRunning}
          />
          {/* Preset chips */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUERY_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => !isRunning && setQuery(p)}
                disabled={isRunning}
                className={`rounded-full border px-3 py-1 text-[0.72rem] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  query === p
                    ? 'border-red-200 bg-red-50 font-semibold text-red-600'
                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600'
                }`}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* 2-col grid of controls */}
        <div className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3">
          {/* Videos */}
          <div>
            <FieldLabel focused={focused === 'count'}>Videos</FieldLabel>
            <NumberStepper value={count} min={1} max={20} disabled={isRunning} onChange={setCount}
              focused={focused === 'count'} onFocus={() => setFocused('count')} onBlur={() => setFocused(null)} />
          </div>

          {/* Min Views */}
          <div>
            <FieldLabel focused={focused === 'minviews'}>Min Views</FieldLabel>
            <select
              className={inputCls}
              value={minViews}
              onChange={e => setMinViews(Number(e.target.value))}
              onFocus={() => setFocused('minviews')}
              onBlur={() => setFocused(null)}
              disabled={isRunning}
            >
              <option value={100_000}>100K+</option>
              <option value={500_000}>500K+</option>
              <option value={1_000_000}>1M+</option>
              <option value={5_000_000}>5M+</option>
              <option value={10_000_000}>10M+</option>
            </select>
          </div>

          {/* Days Back */}
          <div>
            <FieldLabel focused={focused === 'days'}>Days Back</FieldLabel>
            <NumberStepper value={daysBack} min={1} max={90} disabled={isRunning} onChange={setDaysBack}
              focused={focused === 'days'} onFocus={() => setFocused('days')} onBlur={() => setFocused(null)} />
          </div>

          {/* Delay */}
          <div>
            <FieldLabel focused={focused === 'delay'}>Delay (seconds)</FieldLabel>
            <NumberStepper value={delay} min={5} max={300} step={5} disabled={isRunning} onChange={setDelay}
              focused={focused === 'delay'} onFocus={() => setFocused('delay')} onBlur={() => setFocused(null)} />
          </div>
        </div>

        {/* Error */}
        {autoError && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <span className="shrink-0 font-bold">!</span> {autoError}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isRunning || !query.trim()}
          className={`mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
            isRunning ? 'cursor-not-allowed bg-gray-800' : 'bg-red-600 hover:bg-red-700 hover:-translate-y-px active:translate-y-0'
          }`}
          style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}
        >
          {isRunning ? (
            <>
              <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white/25 border-t-white" style={{ animation: 'spin 0.65s linear infinite' }} />
              Running job…
            </>
          ) : (
            <><span className="text-base">⚡</span> Start Auto Upload</>
          )}
        </button>
      </div>

      {autoJob && <JobStatusPanel job={autoJob} onReset={resetAutoJob} />}
    </div>
  );
}