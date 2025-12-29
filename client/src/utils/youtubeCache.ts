/**
 * Кэш YouTube video ID для треков (localStorage)
 */
const YOUTUBE_CACHE_KEY = "scapp_youtube_cache_v1";

interface YouTubeCacheEntry {
  videoId: string;
  updatedAt: number;
}

type YouTubeCache = Record<string, YouTubeCacheEntry>;

function getYouTubeCache(): YouTubeCache {
  if (typeof window === "undefined") return {};
  
  try {
    const raw = localStorage.getItem(YOUTUBE_CACHE_KEY);
    if (!raw) return {};
    
    const parsed = JSON.parse(raw) as YouTubeCache;
    if (!parsed || typeof parsed !== "object") return {};
    
    // Очищаем старые записи (старше 30 дней)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const cleaned: YouTubeCache = {};
    let changed = false;
    
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry?.updatedAt && entry.updatedAt > thirtyDaysAgo && entry?.videoId) {
        cleaned[key] = entry;
      } else {
        changed = true;
      }
    }
    
    if (changed) {
      localStorage.setItem(YOUTUBE_CACHE_KEY, JSON.stringify(cleaned));
    }
    
    return cleaned;
  } catch {
    return {};
  }
}

export function getYouTubeVideoId(trackId: string | number): string | null {
  const cache = getYouTubeCache();
  const entry = cache[String(trackId)];
  return entry?.videoId || null;
}

export function setYouTubeVideoId(trackId: string | number, videoId: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const cache = getYouTubeCache();
    cache[String(trackId)] = {
      videoId,
      updatedAt: Date.now(),
    };
    localStorage.setItem(YOUTUBE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

/**
 * Извлекает YouTube video ID из URL или ID
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  
  // Если уже video ID (11 символов)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }
  
  // Парсим различные форматы YouTube URL
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];
  
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

