import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "server";
  const key = "scapp_session_id";
  let existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const uuid =
    (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  existing = uuid.slice(0, 64);
  window.localStorage.setItem(key, existing);
  return existing;
}

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

export interface Track {
  id: number;
  title: string;
  user: {
    id: number;
    username: string;
    avatar_url: string | null;
  };
  artwork_url: string | null;
  duration: number;
  permalink_url: string;
  genre: string | null;
  created_at: string;
  stream_url?: string;
  soundcloudId?: string;
  media?: {
    transcodings: SoundCloudTranscoding[];
  };
}

interface MusicPlayerContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  queue: Track[];
  playTrack: (track: Track) => void;
  playPlaylist: (tracks: Track[], startIndex?: number) => void;
  togglePlay: () => void;
  pause: () => void;
  play: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  addToQueue: (track: Track) => void;
  clearQueue: () => void;
  preloadTracks: (tracks: Track[]) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

// Глобальный кэш stream URL (сохраняется между ремаунтами)
const streamUrlCache = new Map<number, string>();
const preloadingSet = new Set<number>();
const inflightStreamUrl = new Map<number, Promise<string | null>>();

// Кэш для preload Audio элементов
const audioPreloadCache = new Map<number, HTMLAudioElement>();

const STREAM_URL_PERSIST_KEY = "scapp_stream_url_cache_v1";
const STREAM_URL_PERSIST_TTL_MS = 60 * 60 * 1000; // 1 час

function loadPersistedStreamUrlCache() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STREAM_URL_PERSIST_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { url: string; exp: number }> | null;
    if (!parsed || typeof parsed !== "object") return;

    const now = Date.now();
    let changed = false;
    for (const [k, v] of Object.entries(parsed)) {
      const trackId = Number.parseInt(k, 10);
      if (!Number.isFinite(trackId)) {
        changed = true;
        continue;
      }
      if (!v || typeof v.url !== "string" || typeof v.exp !== "number") {
        changed = true;
        continue;
      }
      if (v.exp <= now) {
        changed = true;
        continue;
      }
      if (!streamUrlCache.has(trackId)) {
        streamUrlCache.set(trackId, v.url);
      }
    }

    // Prune expired/bad entries
    if (changed) {
      const pruned: Record<string, { url: string; exp: number }> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v?.url === "string" && typeof v?.exp === "number" && v.exp > now) {
          pruned[k] = v;
        }
      }
      window.localStorage.setItem(STREAM_URL_PERSIST_KEY, JSON.stringify(pruned));
    }
  } catch {
    // ignore
  }
}

function persistStreamUrl(trackId: number, url: string) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(STREAM_URL_PERSIST_KEY);
    const parsed = (raw ? (JSON.parse(raw) as Record<string, { url: string; exp: number }>) : {}) ?? {};

    parsed[String(trackId)] = { url, exp: now + STREAM_URL_PERSIST_TTL_MS };

    // Keep last ~50 entries by expiration
    const entries = Object.entries(parsed)
      .filter(([, v]) => typeof v?.url === "string" && typeof v?.exp === "number" && v.exp > now)
      .sort((a, b) => (b[1].exp - a[1].exp))
      .slice(0, 50);

    const compact: Record<string, { url: string; exp: number }> = {};
    for (const [k, v] of entries) compact[k] = v;
    window.localStorage.setItem(STREAM_URL_PERSIST_KEY, JSON.stringify(compact));
  } catch {
    // ignore
  }
}

type PlaybackSession = {
  track: Track;
  playRequestedAtMs: number;
  firstAudioAtMs: number | null;
  bufferingSinceMs: number | null;
  maxPositionSec: number;
};

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolumeState] = useState(0.7);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState<Track[]>([]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Track[]>([]);
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils(); 
  const addHistoryMutation = trpc.history.add.useMutation();
  const trackEventMutation = trpc.analytics.trackEvent.useMutation();
  const sessionIdRef = useRef<string>(getOrCreateSessionId());
  const playbackRef = useRef<PlaybackSession | null>(null);
  const suppressPauseEventRef = useRef(false);
  const trackEventRef = useRef<(event: string, track?: Track | null, meta?: unknown) => void>(() => undefined);
  const finalizePlaybackRef = useRef<(reason: string) => void>(() => undefined);
  const playTokenRef = useRef(0);

  useEffect(() => {
    loadPersistedStreamUrlCache();
  }, []);

  const trackEvent = useCallback((event: string, track?: Track | null, meta?: unknown) => {
    try {
      trackEventMutation.mutate({
        event,
        sessionId: sessionIdRef.current,
        page: typeof window !== "undefined" ? window.location.pathname : undefined,
        trackSoundcloudId: track ? (track.soundcloudId || track.id.toString()) : undefined,
        trackTitle: track?.title,
        meta,
      });
    } catch {
      // analytics must never break playback
    }
  }, [trackEventMutation]);

  const finalizePlayback = useCallback((reason: string) => {
    const session = playbackRef.current;
    const audio = audioRef.current;
    if (!session || !audio) return;

    // Берем максимум времени (с учетом перемоток назад/вперед)
    const playedMs = Math.max(0, Math.floor(session.maxPositionSec * 1000));
    const completion = session.track.duration > 0 ? playedMs / session.track.duration : null;

    trackEvent("track_end", session.track, {
      reason,
      playedMs,
      completion,
      durationMs: session.track.duration,
      currentTimeSec: audio.currentTime,
      readyState: audio.readyState,
      networkState: audio.networkState,
    });

    // Записываем историю только если реально слушали (чтобы не шуметь)
    if (isAuthenticated) {
      const minMs = 10_000;
      const minCompletion = 0.15;
      const shouldRecord = playedMs >= minMs || (completion !== null && completion >= minCompletion);

      if (shouldRecord) {
        addHistoryMutation.mutate({
          soundcloudId: session.track.soundcloudId || session.track.id.toString(),
          trackData: {
            title: session.track.title,
            artist: session.track.user.username,
            artworkUrl: session.track.artwork_url,
            duration: session.track.duration,
            streamUrl: session.track.stream_url ?? audio.src ?? null,
            permalinkUrl: session.track.permalink_url,
            genre: session.track.genre,
          },
          playDuration: playedMs,
        });
      }
    }

    playbackRef.current = null;
  }, [addHistoryMutation, isAuthenticated, trackEvent]);

  // Keep latest callbacks for event listeners (so we don't recreate Audio element)
  useEffect(() => {
    trackEventRef.current = trackEvent;
  }, [trackEvent]);

  useEffect(() => {
    finalizePlaybackRef.current = finalizePlayback;
  }, [finalizePlayback]);

  // Синхронизируем ref с state
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Функция получения stream URL с кэшированием (БЫСТРАЯ версия)
  const getStreamUrl = useCallback(async (trackId: number, transcodings?: SoundCloudTranscoding[]): Promise<string | null> => {
    // Проверяем кэш - мгновенный ответ
    if (streamUrlCache.has(trackId)) {
      return streamUrlCache.get(trackId)!;
    }

    // Дедуп запросов к одному и тому же trackId
    const inflight = inflightStreamUrl.get(trackId);
    if (inflight) {
      return await inflight;
    }

    const request = (async () => {
    try {
      let url: string;
      
      // Если есть transcodings - используем быстрый эндпоинт (пропускаем getTrack)
      if (transcodings && transcodings.length > 0) {
        url = await utils.tracks.getStreamUrlFast.fetch({ trackId, transcodings });
      } else {
        url = await utils.tracks.getStreamUrl.fetch({ trackId });
      }
      
      if (url) {
        streamUrlCache.set(trackId, url);
        persistStreamUrl(trackId, url);
        if (streamUrlCache.size > 100) {
          const firstKey = streamUrlCache.keys().next().value;
          if (firstKey) streamUrlCache.delete(firstKey);
        }
      }
      return url;
    } catch (e) {
      console.error("Failed to fetch stream URL:", e);
      return null;
    } finally {
      inflightStreamUrl.delete(trackId);
    }
    })();

    inflightStreamUrl.set(trackId, request);
    return await request;
  }, [utils]);

  // Агрессивная предзагрузка треков - для мгновенного воспроизведения
  const preloadTracks = useCallback((tracks: Track[]) => {
    // Network-aware preloading: на медленной сети только резолвим URL, без скачивания аудио
    const connection = (typeof navigator !== "undefined" ? (navigator as any).connection : undefined) as
      | { saveData?: boolean; effectiveType?: string }
      | undefined;
    const effectiveType = connection?.effectiveType;
    const isSlow = Boolean(connection?.saveData) || effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";

    const maxTracks = isSlow ? 1 : 3;
    const shouldPreloadAudioData = !isSlow;

    const tracksToPreload = tracks.slice(0, maxTracks);
    
    tracksToPreload.forEach(async (track) => {
      // Пропускаем если уже загружено
      if (preloadingSet.has(track.id) || audioPreloadCache.has(track.id)) return;
      if (streamUrlCache.has(track.id)) {
        // URL уже есть - сразу создаём Audio для предзагрузки данных
        const url = streamUrlCache.get(track.id)!;
        if (shouldPreloadAudioData && !audioPreloadCache.has(track.id)) {
          const audio = new Audio();
          audio.preload = "auto";
          audio.src = url;
          audioPreloadCache.set(track.id, audio);
          setTimeout(() => audioPreloadCache.delete(track.id), 3 * 60 * 1000);
        }
        return;
      }
        
        preloadingSet.add(track.id);
        
        try {
        // Используем transcodings для быстрого получения URL
        const url = await getStreamUrl(track.id, track.media?.transcodings);
        
        if (!url) return;
          
        // На медленной сети не качаем аудио заранее — только кэшируем URL
        if (!shouldPreloadAudioData) {
          return;
        }

        if (!audioPreloadCache.has(track.id)) {
            const audio = new Audio();
            audio.preload = "auto";
            audio.src = url;
            audioPreloadCache.set(track.id, audio);
            
          // Удаляем из кэша через 3 минуты
            setTimeout(() => {
              audioPreloadCache.delete(track.id);
          }, 3 * 60 * 1000);
          }
        } finally {
          preloadingSet.delete(track.id);
        }
    });
  }, [getStreamUrl]);

  // Предзагрузка следующих треков в очереди
  const preloadNextInQueue = useCallback(() => {
    const nextTracks = queueRef.current.slice(0, 3);
    if (nextTracks.length > 0) {
      preloadTracks(nextTracks);
    }
  }, [preloadTracks]);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (playbackRef.current) {
        playbackRef.current.maxPositionSec = Math.max(playbackRef.current.maxPositionSec, audio.currentTime);
      }
    };
    const handleDurationChange = () => setDuration(audio.duration);
    const handleCanPlay = () => setIsLoading(false);
    const handleWaiting = () => {
      setIsLoading(true);
      if (playbackRef.current && playbackRef.current.bufferingSinceMs === null) {
        playbackRef.current.bufferingSinceMs = Date.now();
        trackEventRef.current("buffer_start", playbackRef.current.track, {
          currentTimeSec: audio.currentTime,
          readyState: audio.readyState,
          networkState: audio.networkState,
        });
      }
    };

    const handlePlaying = () => {
      setIsLoading(false);

      const session = playbackRef.current;
      if (!session) return;

      const now = Date.now();
      if (session.firstAudioAtMs === null) {
        session.firstAudioAtMs = now;
        trackEventRef.current("first_audio", session.track, {
          ttfaMs: now - session.playRequestedAtMs,
          currentTimeSec: audio.currentTime,
          readyState: audio.readyState,
          networkState: audio.networkState,
        });
      }

      if (session.bufferingSinceMs !== null) {
        const bufferMs = now - session.bufferingSinceMs;
        session.bufferingSinceMs = null;
        trackEventRef.current("buffer_end", session.track, { bufferMs, currentTimeSec: audio.currentTime });
      }
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      finalizePlaybackRef.current("ended");
      // Используем ref вместо state для актуальной очереди
      if (queueRef.current.length > 0) {
        const [next, ...rest] = queueRef.current;
        setQueue(rest);
        _playInternal(next, "auto_next");
      }
    };
    
    const handleError = () => {
      console.error("Audio error");
      setIsLoading(false);
      setIsPlaying(false);
      finalizePlaybackRef.current("error");
      // НЕ пропускаем трек автоматически - пользователь сам решит что делать
    };

    const handlePause = () => {
      if (suppressPauseEventRef.current) {
        suppressPauseEventRef.current = false;
        return;
      }
      if (playbackRef.current) {
        trackEventRef.current("pause", playbackRef.current.track, { currentTimeSec: audio.currentTime });
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
    };
  }, []);

  // Best-effort flush on tab close/navigation
  useEffect(() => {
    const handler = () => finalizePlaybackRef.current("pagehide");
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);

  // Keep audio volume in sync without recreating element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const _playInternal = async (track: Track, startReason: string = "play") => {
    if (!audioRef.current) return;

    const token = ++playTokenRef.current;
    
    // Закрываем предыдущую сессию (если трек переключили)
    finalizePlayback(`switch:${startReason}`);

      setCurrentTrack(track);
    setIsLoading(true);
      setIsPlaying(false);

    // Создаем новую сессию
    playbackRef.current = {
      track,
      playRequestedAtMs: Date.now(),
      firstAudioAtMs: null,
      bufferingSinceMs: null,
      maxPositionSec: 0,
    };
    trackEvent("play_request", track, { reason: startReason });

    // Проверяем предзагруженный Audio элемент - МГНОВЕННОЕ воспроизведение
    const preloadedAudio = audioPreloadCache.get(track.id);
    if (preloadedAudio && preloadedAudio.src) {
      if (token !== playTokenRef.current) return;
      // Используем предзагруженный - моментальный старт!
      suppressPauseEventRef.current = true;
      audioRef.current.pause();
      audioRef.current.src = preloadedAudio.src;
      audioPreloadCache.delete(track.id);
      
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
      });

      // Сохраняем stream_url в currentTrack (чтобы лайк/история видели ссылку)
      setCurrentTrack(prev => (prev && prev.id === track.id) ? { ...prev, stream_url: preloadedAudio.src } : prev);
      persistStreamUrl(track.id, preloadedAudio.src);
      
      // Предзагружаем следующие в фоне
      preloadNextInQueue();
      return;
    }
    
    // Проверяем кэш URL
      let streamUrl = streamUrlCache.get(track.id) || track.stream_url;
      
    // Если URL есть - сразу играем, не ждём
    if (streamUrl) {
      if (token !== playTokenRef.current) return;
      suppressPauseEventRef.current = true;
      audioRef.current.pause();
      audioRef.current.src = streamUrl;
      // НЕ вызываем load() - браузер загрузит автоматически при play()
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsLoading(false);
      });

      setCurrentTrack(prev => (prev && prev.id === track.id) ? { ...prev, stream_url: streamUrl } : prev);
      persistStreamUrl(track.id, streamUrl);
      
      preloadNextInQueue();
      return;
    }
    
    // URL нет - запрашиваем (с transcodings для быстрого получения)
    try {
      streamUrl = await getStreamUrl(track.id, track.media?.transcodings) || undefined;
      if (token !== playTokenRef.current) return;

      if (streamUrl) {
        streamUrlCache.set(track.id, streamUrl);
        persistStreamUrl(track.id, streamUrl);
        suppressPauseEventRef.current = true;
        audioRef.current.pause();
        audioRef.current.src = streamUrl;
        
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsLoading(false);
        });

        setCurrentTrack(prev => (prev && prev.id === track.id) ? { ...prev, stream_url: streamUrl } : prev);
        
        preloadNextInQueue();
      } else {
        toast.error(`Не удалось воспроизвести: ${track.title}`);
        setIsLoading(false);
        
        if (queueRef.current.length > 0) {
          const [next, ...rest] = queueRef.current;
          setQueue(rest);
          _playInternal(next);
        }
      }
    } catch (error) {
      console.error("Play error:", error);
      setIsLoading(false);
      setIsPlaying(false);
      trackEvent("error", track, { message: (error as Error)?.message });
      toast.error(`Не удалось воспроизвести: ${track.title}`);
      // НЕ пропускаем трек автоматически - пользователь сам решит что делать
    }
  };

  const playTrack = useCallback((track: Track) => {
    setQueue([]);
    _playInternal(track, "user_play_track");
  }, []);

  const playPlaylist = useCallback((tracks: Track[], startIndex: number = 0) => {
    if (!tracks || tracks.length === 0) return;

    const trackToPlay = tracks[startIndex];
    const newQueue = tracks.slice(startIndex + 1);
    
    setQueue(newQueue);
    queueRef.current = newQueue;
    
    // Предзагружаем следующие треки
    preloadTracks(newQueue.slice(0, 3));
    
    _playInternal(trackToPlay, "user_play_playlist");
  }, [preloadTracks]);

  const nextTrack = useCallback(() => {
    if (queueRef.current.length > 0) {
      const [next, ...rest] = queueRef.current;
      setQueue(rest);
      queueRef.current = rest;
      _playInternal(next, "user_next");
    }
  }, []);

  const previousTrack = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (playbackRef.current) trackEvent("pause_click", playbackRef.current.track);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
      if (playbackRef.current) trackEvent("play_click", playbackRef.current.track);
    }
  }, [isPlaying]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    audioRef.current?.play();
    setIsPlaying(true);
  }, []);

  const seek = useCallback((time: number) => { 
    if (audioRef.current) { 
      audioRef.current.currentTime = time; 
      setCurrentTime(time); 
      if (playbackRef.current) {
        trackEvent("seek", playbackRef.current.track, { toSec: time });
      }
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    if (audioRef.current) { 
      audioRef.current.volume = v; 
      setVolumeState(v); 
    }
  }, []);

  const addToQueue = useCallback((t: Track) => { 
    setQueue(prev => [...prev, t]); 
    queueRef.current = [...queueRef.current, t];
    toast.success("Добавлено в очередь"); 
    
    // Предзагружаем добавленный трек
    preloadTracks([t]);
  }, [preloadTracks]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    queueRef.current = [];
  }, []);

  return (
    <MusicPlayerContext.Provider
      value={{
        currentTrack, isPlaying, isLoading, volume, currentTime, duration, queue,
        playTrack, playPlaylist, togglePlay, pause, play, seek, setVolume, 
        nextTrack, previousTrack, addToQueue, clearQueue, preloadTracks,
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (context === undefined) throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  return context;
}
