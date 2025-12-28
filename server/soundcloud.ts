import axios, { AxiosError } from 'axios';

// ИСПОЛЬЗУЕМ V2 API КАК В PYTHON СКРИПТЕ
const SOUNDCLOUD_API_BASE = 'https://api-v2.soundcloud.com';
const SOUNDCLOUD_CLIENT_ID = 'dH1Xed1fpITYonugor6sw39jvdq58M3h';

const soundcloudClient = axios.create({
  baseURL: SOUNDCLOUD_API_BASE,
  timeout: 30000, // Увеличен таймаут до 30 секунд
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },
});

// Retry функция
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

// Интерфейсы для V2 API
export interface SoundCloudTranscoding {
  url: string;
  preset: string;
  duration: number;
  snipped: boolean;
  format: {
    protocol: string;
    mime_type: string;
  };
  quality: string;
}

export interface SoundCloudTrackV2 {
  id: number;
  title: string;
  duration: number;
  artwork_url: string | null;
  permalink_url: string;
  genre: string | null;
  user: {
    id: number;
    username: string;
    avatar_url: string | null;
  };
  playback_count?: number;
  likes_count?: number;
  created_at: string;
  media?: {
    transcodings: SoundCloudTranscoding[];
  };
}

export interface SoundCloudPlaylistV2 {
  id: number;
  title: string;
  description: string | null;
  duration: number;
  artwork_url: string | null;
  permalink_url: string;
  user: {
    id: number;
    username: string;
  };
  tracks: SoundCloudTrackV2[];
  track_count: number;
}

// Вспомогательная функция для преобразования ответа V2 в единый формат
function mapTrackV2(track: any): SoundCloudTrackV2 {
  const t = track.track || track;
  return {
    id: t.id,
    title: t.title,
    duration: t.duration,
    artwork_url: t.artwork_url ? t.artwork_url.replace('-large', '-t500x500') : t.user?.avatar_url,
    permalink_url: t.permalink_url,
    genre: t.genre,
    user: {
      id: t.user?.id,
      username: t.user?.username,
      avatar_url: t.user?.avatar_url
    },
    playback_count: t.playback_count,
    likes_count: t.likes_count,
    created_at: t.created_at,
    media: t.media
  };
}

/**
 * Search for tracks on SoundCloud V2
 */
export async function searchTracks(query: string, limit: number = 20): Promise<SoundCloudTrackV2[]> {
  try {
    const response = await withRetry(() => 
      soundcloudClient.get('/search/tracks', {
        params: {
          q: query,
          client_id: SOUNDCLOUD_CLIENT_ID,
          limit,
        },
      })
    );
    
    const collection = response.data.collection || [];
    return collection
      .filter((item: any) => item.kind === 'track')
      .map(mapTrackV2);

  } catch (error) {
    console.error('Error searching tracks:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Get track details by ID V2
 */
export async function getTrack(trackId: number): Promise<SoundCloudTrackV2> {
  const response = await withRetry(() =>
    soundcloudClient.get(`/tracks/${trackId}`, {
      params: { client_id: SOUNDCLOUD_CLIENT_ID },
    })
  );
  return mapTrackV2(response.data);
}

/**
 * Get related tracks
 */
export async function getRelatedTracks(trackId: number, limit: number = 20): Promise<SoundCloudTrackV2[]> {
  try {
    const response = await withRetry(() =>
      soundcloudClient.get(`/tracks/${trackId}/related`, {
        params: {
          client_id: SOUNDCLOUD_CLIENT_ID,
          limit,
        },
      })
    );
    const collection = response.data.collection || [];
    return collection.map(mapTrackV2);
  } catch (error) {
    console.error('Error getting related tracks:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Search for playlists V2
 */
export async function searchPlaylists(query: string, limit: number = 20): Promise<SoundCloudPlaylistV2[]> {
  try {
    const response = await withRetry(() =>
      soundcloudClient.get('/search/playlists', {
        params: {
          q: query,
          client_id: SOUNDCLOUD_CLIENT_ID,
          limit,
        },
      })
    );
    return (response.data.collection || []).filter((i: any) => i.kind === 'playlist');
  } catch (error) {
    return [];
  }
}

/**
 * Получение прямой ссылки на MP3
 */
export async function getStreamUrl(trackId: number): Promise<string> {
  try {
    const track = await getTrack(trackId);
    
    if (!track.media || !track.media.transcodings) {
      throw new Error('No media transcodings found');
    }

    // Ищем progressive поток (mp3)
    let streamApiUrl = track.media.transcodings.find(
      t => t.format.protocol === 'progressive'
    )?.url;

    // Если нет progressive, берем первый доступный
    if (!streamApiUrl && track.media.transcodings.length > 0) {
      streamApiUrl = track.media.transcodings[0].url;
    }

    if (!streamApiUrl) {
      throw new Error('No stream URL found in transcodings');
    }

    // Получаем финальную ссылку
    const response = await withRetry(() =>
      axios.get(`${streamApiUrl}?client_id=${SOUNDCLOUD_CLIENT_ID}`, {
        timeout: 15000,
      })
    );
    
    if (response.data && response.data.url) {
      return response.data.url;
    }

    throw new Error('Failed to resolve direct stream URL');
  } catch (error) {
    console.error('Error getting stream URL:', error instanceof Error ? error.message : error);
    throw new Error('Failed to get stream URL');
  }
}
