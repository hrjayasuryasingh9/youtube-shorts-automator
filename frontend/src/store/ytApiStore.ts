import { create } from 'zustand';

const STORAGE_KEY = 'yt_api_key';

interface YtApiState {
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

export const useYtApiStore = create<YtApiState>((set) => ({
  apiKey: localStorage.getItem(STORAGE_KEY) ?? '',

  setApiKey: (key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    set({ apiKey: key });
  },

  clearApiKey: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ apiKey: '' });
  },
}));

// ─── Fetch stats for a list of video IDs from YouTube Data API v3 ──────────
export interface VideoStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export async function fetchYouTubeStats(
  videoIds: string[],
  apiKey: string
): Promise<Record<string, VideoStats>> {
  if (!videoIds.length || !apiKey) return {};

  // YouTube allows up to 50 IDs per request
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const result: Record<string, VideoStats> = {};

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      part: 'statistics',
      id: chunk.join(','),
      key: apiKey,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message ?? `YouTube API error ${res.status}`);
    }
    const data = await res.json();
    for (const item of data.items ?? []) {
      result[item.id] = {
        viewCount: parseInt(item.statistics?.viewCount ?? '0', 10),
        likeCount: parseInt(item.statistics?.likeCount ?? '0', 10),
        commentCount: parseInt(item.statistics?.commentCount ?? '0', 10),
      };
    }
  }

  return result;
}