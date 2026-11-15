import { create } from 'zustand';
import { API_BASE } from './authStore';
import "../index.css";

// ─── Types ─────────────────────────────────────────────────────────
export interface AIGenerateJob {
  jobId: string;
  status: 'running' | 'done' | 'error';
  stage: 'scripting' | 'generating_video' | 'complete';
  error: string | null;
  script: string | null;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  videoUrl: string | null;
}

export interface AIVideo {
  id: string;
  topic: string;
  style: string;
  script: string;
  title: string;
  description: string;
  tags: string[];
  videoUrl: string;
  createdAt: string;
  uploaded: boolean;
  youtubeId: string | null;
}

export interface AIUploadState {
  loading: boolean;
  done: boolean;
  error: string | null;
  youtubeId: string | null;
}

// ─── Transformers ──────────────────────────────────────────────────
function transformAIJob(raw: Record<string, unknown>): AIGenerateJob {
  return {
    jobId:       raw.job_id as string,
    status:      raw.status as AIGenerateJob['status'],
    stage:       (raw.stage as AIGenerateJob['stage']) || 'scripting',
    error:       raw.error as string | null,
    script:      raw.script as string | null,
    title:       raw.title as string | null,
    description: raw.description as string | null,
    tags:        raw.tags as string[] | null,
    videoUrl:    raw.video_url as string | null,
  };
}

function transformAIVideo(raw: Record<string, unknown>): AIVideo {
  return {
    id:          raw.id as string,
    topic:       raw.topic as string,
    style:       raw.style as string,
    script:      raw.script as string,
    title:       raw.title as string,
    description: raw.description as string,
    tags:        (raw.tags as string[]) ?? [],
    videoUrl:    raw.video_url as string,
    createdAt:   raw.created_at as string,
    uploaded:    (raw.uploaded as boolean) ?? false,
    youtubeId:   raw.youtube_id as string | null,
  };
}

// ─── Store ─────────────────────────────────────────────────────────
interface AIVideoState {
  openaiKey: string;
  setOpenaiKey: (key: string) => void;

  generateJob: AIGenerateJob | null;
  generateLoading: boolean;
  generateError: string | null;

  aiVideos: AIVideo[];
  aiVideosLoading: boolean;
  aiVideosError: string | null;

  uploadStates: Record<string, AIUploadState>;

  startGenerate: (p: { topic: string; style: string; duration: number }) => Promise<void>;
  resetGenerateJob: () => void;
  fetchAIVideos: () => Promise<void>;
  uploadToYouTube: (videoId: string, privacy: 'public' | 'unlisted' | 'private') => Promise<void>;
}

const pollers: Map<string, ReturnType<typeof setInterval>> = new Map();

export const useAIVideoStore = create<AIVideoState>((set, get) => {
  const poll = (jobId: string) => {
    if (pollers.has(jobId)) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/ai-generate-job/${jobId}`);
        if (!res.ok) return;
        const raw = await res.json();
        const job = transformAIJob(raw);
        set({ generateJob: job });
        if (job.status === 'done' || job.status === 'error') {
          clearInterval(interval);
          pollers.delete(jobId);
          if (job.status === 'done') get().fetchAIVideos();
        }
      } catch { /* ignore */ }
    }, 2000);
    pollers.set(jobId, interval);
  };

  return {
    openaiKey: localStorage.getItem('openai_key') || '',
    setOpenaiKey: (key) => {
      localStorage.setItem('openai_key', key);
      set({ openaiKey: key });
    },

    generateJob: null,
    generateLoading: false,
    generateError: null,

    aiVideos: [],
    aiVideosLoading: false,
    aiVideosError: null,

    uploadStates: {},

    startGenerate: async ({ topic, style, duration }) => {
      const { openaiKey } = get();
      set({ generateLoading: true, generateError: null, generateJob: null });
      try {
        const res = await fetch(`${API_BASE}/ai-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, style, duration, openai_api_key: openaiKey }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed to start generation'); }
        const data = await res.json();
        set({
          generateJob: {
            jobId: data.job_id,
            status: 'running',
            stage: 'scripting',
            error: null,
            script: null,
            title: null,
            description: null,
            tags: null,
            videoUrl: null,
          },
          generateLoading: false,
        });
        poll(data.job_id);
      } catch (err: unknown) {
        set({ generateLoading: false, generateError: err instanceof Error ? err.message : 'Unknown error' });
      }
    },

    resetGenerateJob: () => {
      const { generateJob } = get();
      if (generateJob) pollers.delete(generateJob.jobId);
      set({ generateJob: null, generateError: null });
    },

    fetchAIVideos: async () => {
      set({ aiVideosLoading: true, aiVideosError: null });
      try {
        const res = await fetch(`${API_BASE}/ai-videos`);
        if (!res.ok) throw new Error('Failed to fetch AI videos');
        const data = await res.json();
        const videos = ((data.videos ?? []) as Record<string, unknown>[]).map(transformAIVideo);
        videos.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
        set({ aiVideos: videos, aiVideosLoading: false });
      } catch (err: unknown) {
        set({ aiVideosLoading: false, aiVideosError: err instanceof Error ? err.message : 'Unknown error' });
      }
    },

    uploadToYouTube: async (videoId, privacy) => {
      set((s) => ({
        uploadStates: {
          ...s.uploadStates,
          [videoId]: { loading: true, done: false, error: null, youtubeId: null },
        },
      }));
      try {
        const res = await fetch(`${API_BASE}/ai-upload/${videoId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privacy }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Upload failed'); }
        const data = await res.json();
        set((s) => ({
          uploadStates: {
            ...s.uploadStates,
            [videoId]: { loading: false, done: true, error: null, youtubeId: data.youtube_id },
          },
          aiVideos: s.aiVideos.map((v) =>
            v.id === videoId ? { ...v, uploaded: true, youtubeId: data.youtube_id } : v
          ),
        }));
      } catch (err: unknown) {
        set((s) => ({
          uploadStates: {
            ...s.uploadStates,
            [videoId]: { loading: false, done: false, error: err instanceof Error ? err.message : 'Upload failed', youtubeId: null },
          },
        }));
      }
    },
  };
});