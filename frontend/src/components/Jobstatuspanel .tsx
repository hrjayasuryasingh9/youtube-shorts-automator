import type { Job } from '../store/uploadStore';

interface Props { job: Job; onReset: () => void; }

const STATUS_ICON: Record<string, string>  = { success: '✓', duplicate: '↺', failed: '✕', running: '·' };
const STATUS_TW:   Record<string, string>  = {
  success: 'text-green-600',
  duplicate: 'text-amber-500',
  failed: 'text-red-600',
  running: 'text-gray-400',
};

export default function JobStatusPanel({ job, onReset }: Props) {
  const done = job.status === 'done' || job.status === 'error';

  // Badge styles per status
  const badgeCls =
    job.status === 'running' ? 'border border-red-200 bg-red-50 text-red-600'
    : job.status === 'done'  ? 'border border-green-200 bg-green-50 text-green-700'
    : 'border border-red-200 bg-red-50 text-red-900';

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-5"
      style={{ animation: 'fadeUp 0.2s ease' }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-gray-400">JOB</span>
          <code className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-800">
            {job.jobId}
          </code>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold tracking-wide ${badgeCls}`}>
            {job.status === 'running' && (
              <i
                className="inline-block h-1 w-1 rounded-full bg-current"
                style={{ animation: 'blink 0.8s ease infinite' }}
              />
            )}
            {job.status === 'running' ? 'RUNNING' : job.status === 'done' ? 'DONE' : 'ERROR'}
          </span>
        </div>
        {done && (
          <button
            onClick={onReset}
            className="rounded border border-gray-200 px-2 py-1 text-[0.72rem] font-medium text-gray-500 transition-all hover:border-red-200 hover:text-red-600"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Metrics */}
      <div className="mb-4 flex gap-2">
        {[
          { n: job.uploaded,          l: 'Uploaded', cls: 'border-green-200 bg-green-50' },
          { n: job.failed,            l: 'Failed',   cls: 'border-red-200 bg-red-50'     },
          { n: job.skippedDuplicates, l: 'Dupes',    cls: 'border-amber-200 bg-amber-50' },
          { n: job.results.length,    l: 'Total',    cls: 'border-blue-200 bg-blue-50'   },
        ].map(({ n, l, cls }) => (
          <div key={l} className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 ${cls}`}>
            <span className="text-2xl font-extrabold leading-none text-gray-900" style={{ fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              {n}
            </span>
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-gray-500">{l}</span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {job.status === 'running' && (
        <div className="mb-3 flex items-center gap-3">
          <div className="flex-1 overflow-hidden rounded-full bg-gray-200" style={{ height: 3 }}>
            <div
              className="h-full w-[30%] rounded-full bg-red-600"
              style={{ animation: 'loadSlide 1.8s ease-in-out infinite' }}
            />
          </div>
          <span className="whitespace-nowrap text-xs text-gray-400">Processing…</span>
        </div>
      )}

      {/* Error */}
      {job.error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <span className="shrink-0 font-bold">!</span>
          <span>{job.error}</span>
        </div>
      )}

      {/* Results list */}
      {job.results.length > 0 && (
        <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto [scrollbar-width:thin]">
          {job.results.map((r, i) => (
            <div
              key={r.originalId + i}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-2 transition-colors hover:border-gray-300"
              style={{ animation: 'fadeUp 0.2s ease both', animationDelay: `${i * 0.04}s` }}
            >
              {r.thumbnail ? (
                <img src={r.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-200 text-sm text-gray-400">▶</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-semibold text-gray-900">{r.title || r.originalId}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  {r.views != null && <span className="text-[0.68rem] text-gray-400">{r.views.toLocaleString()} views</span>}
                  {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-[0.68rem] font-semibold text-red-600 transition-opacity hover:opacity-70">Open ↗</a>}
                  {r.failReason && <span className="text-[0.68rem] text-red-800">{r.failReason}</span>}
                </div>
              </div>
              <span className={`w-5 shrink-0 text-center text-sm font-bold ${STATUS_TW[r.status] || ''}`}>
                {STATUS_ICON[r.status] || '?'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Empty running */}
      {job.status === 'running' && job.results.length === 0 && (
        <div className="flex flex-col items-center gap-3 pb-2 pt-5 text-xs text-gray-400">
          <div className="flex h-6 items-end gap-1">
            {[1,2,3,4,5,6].map(i => (
              <div
                key={i}
                className="w-1 rounded-sm bg-red-600 opacity-70"
                style={{ height: 4, animation: `barPulse 0.9s ease-in-out infinite`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
          <p>Searching for videos…</p>
        </div>
      )}
    </div>
  );
}