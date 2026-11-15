import { create } from 'zustand';
import { API_BASE } from './authStore';
import { useAuthStore } from './authStore';

// ─── Types ────────────────────────────────────────────────────────
export interface UploadResult {
  originalId: string;
  newId?: string;
  title: string;
  views?: number;
  thumbnail?: string;
  durationSeconds?: number;
  url?: string;
  uploadedAt?: string;
  status: 'success' | 'failed' | 'duplicate' | 'running';
  failReason?: string;
}

export interface Job {
  jobId: string;
  status: 'running' | 'done' | 'error';
  error: string | null;
  uploaded: number;
  failed: number;
  skippedDuplicates: number;
  results: UploadResult[];
}

export interface UploadedVideo {
  originalId: string;
  newId: string;
  title: string;
  thumbnail: string;
  durationSeconds: number;
  url: string;
  uploadedAt: string;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

// ─── Transformers ─────────────────────────────────────────────────
function transformResult(raw: Record<string, unknown>): UploadResult {
  const s = raw.status as string;
  let status: UploadResult['status'] = 'failed';
  let failReason: string | undefined;
  if (s === 'success') status = 'success';
  else if (s === 'skipped_duplicate') status = 'duplicate';
  else if (s === 'download_failed') { status = 'failed'; failReason = (raw.fail_reason as string) || 'Download failed'; }
  else if (s?.startsWith('upload_failed')) { status = 'failed'; failReason = s.replace('upload_failed: ', ''); }
  return {
    originalId: raw.original_id as string,
    newId: raw.new_id as string | undefined,
    title: raw.title as string ?? '',
    views: raw.views as number | undefined,
    thumbnail: raw.thumbnail as string | undefined,
    durationSeconds: raw.duration_s as number | undefined,
    url: raw.url as string | undefined,
    uploadedAt: raw.uploaded_at as string | undefined,
    status, failReason,
  };
}

function transformJob(raw: Record<string, unknown>): Job {
  return {
    jobId: raw.job_id as string,
    status: raw.status as Job['status'],
    error: raw.error as string | null,
    uploaded: (raw.uploaded as number) ?? 0,
    failed: (raw.failed as number) ?? 0,
    skippedDuplicates: (raw.skipped_duplicates as number) ?? 0,
    results: ((raw.results ?? []) as Record<string, unknown>[]).map(transformResult),
  };
}

function transformVideo(raw: Record<string, unknown>): UploadedVideo {
  return {
    originalId: raw.original_id as string,
    newId: raw.new_id as string,
    title: raw.title as string,
    thumbnail: (raw.thumbnail as string) ?? '',
    durationSeconds: (raw.duration_s as number) ?? 0,
    url: raw.url as string,
    uploadedAt: raw.uploaded_at as string,
  };
}

// ─── Store ────────────────────────────────────────────────────────
interface UploadState {
  autoJob: Job | null;
  autoLoading: boolean;
  autoError: string | null;

  linkJob: Job | null;
  linkLoading: boolean;
  linkError: string | null;

  videos: UploadedVideo[];
  videosLoading: boolean;
  videosError: string | null;

  toasts: Toast[];

  startAutoUpload: (p: { query: string; count: number; delaySeconds: number; minViews: number; daysBack: number }) => Promise<void>;
  startUploadByLink: (url: string, privacy: string) => Promise<void>;
  fetchVideos: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  resetAutoJob: () => void;
  resetLinkJob: () => void;
  addToast: (type: Toast['type'], message: string) => void;
  removeToast: (id: string) => void;
}

const pollers: Map<string, ReturnType<typeof setInterval>> = new Map();

export const useUploadStore = create<UploadState>((set, get) => {
  const addToast = (type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => get().removeToast(id), 4500);
  };

  const poll = (jobId: string, jobType: 'auto' | 'link') => {
    if (pollers.has(jobId)) return;
    const key = jobType === 'auto' ? 'autoJob' : 'linkJob';
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/job/${jobId}`);
        if (!res.ok) return;
        const raw = await res.json();
        const job = transformJob(raw);
        set({ [key]: job } as Partial<UploadState>);
        // refresh sidebar stats — background=true so no splash blink
        useAuthStore.getState().checkAuth(false);
        if (job.status === 'done' || job.status === 'error') {
          clearInterval(interval); pollers.delete(jobId);
          get().fetchVideos();
          if (job.status === 'done' && job.uploaded > 0) addToast('success', `Uploaded ${job.uploaded} video${job.uploaded !== 1 ? 's' : ''} successfully!`);
          else if (job.status === 'error') addToast('error', job.error || 'Job failed');
          else if (job.uploaded === 0) addToast('warning', 'Job finished but no videos were uploaded.');
        }
      } catch  { /* ignore */ }
    }, 1500);
    pollers.set(jobId, interval);
  };

  return {
    autoJob: null, autoLoading: false, autoError: null,
    linkJob: null, linkLoading: false, linkError: null,
    videos: [], videosLoading: false, videosError: null,
    toasts: [],

    startAutoUpload: async (params) => {
      set({ autoLoading: true, autoError: null, autoJob: null });
      try {
        const res = await fetch(`${API_BASE}/auto-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: params.query, count: params.count,
            delay_seconds: params.delaySeconds, min_views: params.minViews, days_back: params.daysBack }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }
        const data = await res.json();
        set({ autoJob: { jobId: data.job_id, status: 'running', error: null, uploaded: 0, failed: 0, skippedDuplicates: 0, results: [] }, autoLoading: false });
        poll(data.job_id, 'auto');
        addToast('info', 'Auto-upload job started!');
      } catch (err: unknown) {
        set({ autoLoading: false, autoError: err instanceof Error ? err.message : 'Unknown error' });
        addToast('error', err instanceof Error ? err.message : 'Unknown error');
      }
    },

    startUploadByLink: async (videoUrl, privacy) => {
      set({ linkLoading: true, linkError: null, linkJob: null });
      try {
        const res = await fetch(`${API_BASE}/upload-by-id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_url_or_id: videoUrl, privacy }),
        });
        if (res.status === 409) { const e = await res.json(); throw new Error(e.detail || 'Duplicate video'); }
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }
        const data = await res.json();
        set({ linkJob: { jobId: data.job_id, status: 'running', error: null, uploaded: 0, failed: 0, skippedDuplicates: 0, results: [] }, linkLoading: false });
        poll(data.job_id, 'link');
        addToast('info', 'Upload job started!');
      } catch (err: unknown) {
        set({ linkLoading: false, linkError: err instanceof Error ? err.message : 'Unknown error' });
        addToast('error', err instanceof Error ? err.message : 'Unknown error');
      }
    },

    fetchVideos: async () => {
      set({ videosLoading: true, videosError: null });
      try {
        const res = await fetch(`${API_BASE}/videos`);
        if (!res.ok) throw new Error('Failed to fetch videos');
        const data = await res.json();
        const videos = ((data.videos ?? []) as Record<string, unknown>[]).map(transformVideo);
        videos.sort((a, b) => (b.uploadedAt > a.uploadedAt ? 1 : -1));
        set({ videos, videosLoading: false });
      } catch (err: unknown) {
        set({ videosLoading: false, videosError: err instanceof Error ? err.message : 'Unknown error' });
      }
    },

    refreshStatus: async () => {
      await useAuthStore.getState().checkAuth();
    },

    resetAutoJob: () => {
      if (get().autoJob) pollers.delete(get().autoJob!.jobId);
      set({ autoJob: null, autoError: null });
    },
    resetLinkJob: () => {
      if (get().linkJob) pollers.delete(get().linkJob!.jobId);
      set({ linkJob: null, linkError: null });
    },

    addToast,
    removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});