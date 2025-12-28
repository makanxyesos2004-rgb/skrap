import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

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

// Кэш для preload Audio элементов
const audioPreloadCache = new Map<number, HTMLAudioElement>();

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

  // Синхронизируем ref с state
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Функция получения stream URL с кэшированием
  const getStreamUrl = useCallback(async (trackId: number): Promise<string | null> => {
    // Проверяем кэш
    if (streamUrlCache.has(trackId)) {
      return streamUrlCache.get(trackId)!;
    }

    try {
      const url = await utils.tracks.getStreamUrl.fetch({ trackId });
      if (url) {
        streamUrlCache.set(trackId, url);
        // Очищаем старые записи если кэш слишком большой
        if (streamUrlCache.size > 100) {
          const firstKey = streamUrlCache.keys().next().value;
          if (firstKey) streamUrlCache.delete(firstKey);
        }
      }
      return url;
    } catch (e) {
      console.error("Failed to fetch stream URL:", e);
      return null;
    }
  }, [utils]);

  // Предзагрузка треков
  const preloadTracks = useCallback(async (tracks: Track[]) => {
    // Загружаем URL для первых 5 треков параллельно
    const tracksToPreload = tracks.slice(0, 5);
    
    await Promise.all(
      tracksToPreload.map(async (track) => {
        if (preloadingSet.has(track.id) || streamUrlCache.has(track.id)) return;
        
        preloadingSet.add(track.id);
        
        try {
          const url = await getStreamUrl(track.id);
          
          // Создаем Audio element для реальной предзагрузки аудио
          if (url && !audioPreloadCache.has(track.id)) {
            const audio = new Audio();
            audio.preload = "auto";
            audio.src = url;
            audioPreloadCache.set(track.id, audio);
            
            // Удаляем из кэша через 5 минут
            setTimeout(() => {
              audioPreloadCache.delete(track.id);
            }, 5 * 60 * 1000);
          }
        } finally {
          preloadingSet.delete(track.id);
        }
      })
    );
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

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleCanPlay = () => setIsLoading(false);
    const handleWaiting = () => setIsLoading(true);
    
    const handleEnded = () => {
      setIsPlaying(false);
      // Используем ref вместо state для актуальной очереди
      if (queueRef.current.length > 0) {
        const [next, ...rest] = queueRef.current;
        setQueue(rest);
        _playInternal(next);
      }
    };
    
    const handleError = () => {
      console.error("Audio error, skipping");
      setIsLoading(false);
      if (queueRef.current.length > 0) {
        const [next, ...rest] = queueRef.current;
        setQueue(rest);
        _playInternal(next);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
    };
  }, []);

  const _playInternal = async (track: Track) => {
    if (!audioRef.current) return;
    
    try {
      setCurrentTrack(track);
      setIsPlaying(false);
      setIsLoading(true);

      // Сначала проверяем кэш, потом stream_url трека
      let streamUrl = streamUrlCache.get(track.id) || track.stream_url;
      
      // Если ссылки нет, запрашиваем
      if (!streamUrl) {
        streamUrl = await getStreamUrl(track.id) || undefined;
      }

      if (streamUrl) {
        // Кэшируем URL
        streamUrlCache.set(track.id, streamUrl);
        
        audioRef.current.src = streamUrl;
        audioRef.current.load();
        
        try {
          await audioRef.current.play();
          setIsPlaying(true);
          
          // Предзагружаем следующие треки
          preloadNextInQueue();
          
          // История
          if (isAuthenticated) {
            addHistoryMutation.mutate({
              soundcloudId: track.soundcloudId || track.id.toString(),
              trackData: {
                title: track.title,
                artist: track.user.username,
                artworkUrl: track.artwork_url,
                duration: track.duration,
                streamUrl: streamUrl,
                permalinkUrl: track.permalink_url,
                genre: track.genre,
              },
            });
          }
        } catch (playError) {
          console.error("Playback error:", playError);
          setIsLoading(false);
        }
      } else {
        toast.error(`Не удалось воспроизвести: ${track.title}`);
        setIsLoading(false);
        // Пробуем следующий трек
        if (queueRef.current.length > 0) {
          const [next, ...rest] = queueRef.current;
          setQueue(rest);
          _playInternal(next);
        }
      }

    } catch (error) {
      console.error("Play error:", error);
      setIsLoading(false);
      if (queueRef.current.length > 0) {
        const [next, ...rest] = queueRef.current;
        setQueue(rest);
        _playInternal(next);
      }
    }
  };

  const playTrack = useCallback((track: Track) => {
    setQueue([]);
    _playInternal(track);
  }, []);

  const playPlaylist = useCallback((tracks: Track[], startIndex: number = 0) => {
    if (!tracks || tracks.length === 0) return;

    const trackToPlay = tracks[startIndex];
    const newQueue = tracks.slice(startIndex + 1);
    
    setQueue(newQueue);
    queueRef.current = newQueue;
    
    // Предзагружаем следующие треки
    preloadTracks(newQueue.slice(0, 3));
    
    _playInternal(trackToPlay);
  }, [preloadTracks]);

  const nextTrack = useCallback(() => {
    if (queueRef.current.length > 0) {
      const [next, ...rest] = queueRef.current;
      setQueue(rest);
      queueRef.current = rest;
      _playInternal(next);
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
    } else {
      audioRef.current.play();
      setIsPlaying(true);
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
