import { useState, useEffect, useCallback, useRef } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Heart,
  X, Maximize2, Minimize2, Youtube, Music2, ThumbsDown,
  Loader2, ListMusic, ChevronLeft, ChevronRight, Link2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Track } from "@/contexts/MusicPlayerContext";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getYouTubeVideoId, setYouTubeVideoId, extractYouTubeVideoId } from "@/utils/youtubeCache";

interface FullscreenPlayerProps {
  currentTrack: Track;
  isPlaying: boolean;
  isLoading: boolean;
  isLiked: boolean;
  isDisliked: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  queue: Track[];
  onClose: () => void;
  togglePlay: () => void;
  play: () => void;
  previousTrack: () => void;
  nextTrack: () => void;
  handleLike: () => void;
  handleDislike: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
}

export default function FullscreenPlayer({
  currentTrack,
  isPlaying,
  isLoading,
  isLiked,
  isDisliked,
  currentTime,
  duration,
  volume,
  queue,
  onClose,
  togglePlay,
  play,
  previousTrack,
  nextTrack,
  handleLike,
  handleDislike,
  seek,
  setVolume,
}: FullscreenPlayerProps) {
  const [showVideo, setShowVideo] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [mouseIdle, setMouseIdle] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputValue, setManualInputValue] = useState("");
  const [cacheKey, setCacheKey] = useState(0);
  const hasAutoPlayedRef = useRef(false);

  const artworkUrl = currentTrack.artwork_url?.replace("-large", "-t500x500") || null;
  
  // Реактивно читаем кэш localStorage для этого трека
  const [cachedVideoId, setCachedVideoId] = useState<string | null>(() => getYouTubeVideoId(currentTrack.id));
  
  // Обновляем cachedVideoId при изменении трека или cacheKey
  useEffect(() => {
    setCachedVideoId(getYouTubeVideoId(currentTrack.id));
  }, [currentTrack.id, cacheKey]);
  
  // Ищем видео через YouTube только если нет в кэше И открыта вкладка видео
  const { data: autoVideoId, isLoading: youtubeLoading } = trpc.youtube.searchVideo.useQuery(
    {
      trackTitle: currentTrack.title,
      artist: currentTrack.user.username,
    },
    {
      enabled: showVideo && !!currentTrack && !cachedVideoId,
      staleTime: 10 * 60 * 1000,
      retry: 1,
      // Отключаем запрос если компонент не виден
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  );
  
  // Приоритет: кэш > автоматический поиск
  const youtubeVideoId = cachedVideoId || autoVideoId || null;
  
  // YouTube embed URL с конкретным video ID (autoplay=1 для автоматического запуска, mute=1 чтобы не конфликтовать с аудио)
  // Видео играет без звука, звук идет из аудио плеера - счетчик работает нормально
  const youtubeEmbedUrl = youtubeVideoId
    ? `https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1&mute=1&controls=1&modestbranding=1&rel=0&showinfo=0&enablejsapi=1&origin=${window.location.origin}&playsinline=1`
    : null;
  
  // Ref для iframe (на будущее для YouTube API)
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Сбрасываем состояние загрузки видео при смене трека или режима
  useEffect(() => {
    setVideoLoaded(false);
    setShowManualInput(false);
    setManualInputValue("");
  }, [currentTrack.id, showVideo, youtubeVideoId, cacheKey]);
  
  // Сбрасываем флаг автозапуска при смене трека
  useEffect(() => {
    hasAutoPlayedRef.current = false;
  }, [currentTrack.id]);
  
  // Автоматически запускаем аудио когда открывается полноэкранный режим с клипом
  useEffect(() => {
    // Запускаем только если:
    // 1. Показываем видео
    // 2. Есть YouTube video ID
    // 3. Аудио не играет
    // 4. Еще не запускали автоматически
    if (showVideo && youtubeVideoId && !isPlaying && !hasAutoPlayedRef.current) {
      // Небольшая задержка чтобы дать время загрузиться
      const timer = setTimeout(() => {
        // Проверяем еще раз перед запуском
        if (!isPlaying && !hasAutoPlayedRef.current) {
          hasAutoPlayedRef.current = true;
          // Используем play() напрямую для гарантированного запуска
          play();
        }
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [showVideo, youtubeVideoId, isPlaying, play]);
  
  // Видео играет без звука (mute=1), звук идет из аудио плеера
  // Это позволяет счетчику работать нормально
  
  // Формируем поисковый запрос для YouTube (если нужно открыть поиск)
  const searchQuery = `${currentTrack.title} ${currentTrack.user.username} official video`;
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
  
  // Обработка ручного ввода
  const handleManualSubmit = () => {
    const videoId = extractYouTubeVideoId(manualInputValue);
    if (videoId) {
      setYouTubeVideoId(currentTrack.id, videoId);
      setShowManualInput(false);
      setManualInputValue("");
      toast.success("YouTube клип сохранен!");
      // Обновляем компонент через принудительный ререндер iframe
      setCacheKey(prev => prev + 1);
    } else {
      toast.error("Некорректный YouTube URL или video ID");
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Auto-hide controls
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const handleMouseMove = () => {
      setControlsVisible(true);
      setMouseIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setMouseIdle(true);
        if (isPlaying) setControlsVisible(false);
      }, 3000);
    };

    window.addEventListener("mousemove", handleMouseMove);
    handleMouseMove();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(timeout);
    };
  }, [isPlaying]);


  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // При закрытии полноэкранного режима возобновляем аудио если видео было активно
        if (showVideo && youtubeVideoId) {
          // Не делаем ничего автоматически - пусть пользователь сам управляет
        }
        onClose();
      }
      // Space - управление воспроизведением (работает всегда)
      if (e.key === " ") { 
        e.preventDefault(); 
        togglePlay(); 
      }
      if (e.key === "ArrowRight") seek(Math.min(currentTime + 10, duration));
      if (e.key === "ArrowLeft") seek(Math.max(currentTime - 10, 0));
      if (e.key === "ArrowUp") setVolume(Math.min(volume + 0.1, 1));
      if (e.key === "ArrowDown") setVolume(Math.max(volume - 0.1, 0));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, togglePlay, seek, setVolume, currentTime, duration, volume, showVideo, youtubeVideoId]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black overflow-hidden"
      style={{ cursor: mouseIdle && isPlaying ? "none" : "default" }}
    >
      {/* Background - Blurred artwork */}
      <div className="absolute inset-0">
        {artworkUrl && (
          <img
            src={artworkUrl}
            alt=""
            className="w-full h-full object-cover scale-110 blur-3xl opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60" />
      </div>

      {/* Main Content */}
      <div className="relative h-full flex flex-col">
        {/* Top Bar */}
        <AnimatePresence>
          {controlsVisible && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-0 left-0 right-0 z-10 p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent"
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 text-white hover:bg-white/10"
                onClick={onClose}
              >
                <X className="w-6 h-6" />
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant={showVideo ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-2",
                    showVideo ? "bg-white text-black hover:bg-white/90" : "text-white hover:bg-white/10"
                  )}
                  onClick={() => setShowVideo(true)}
                >
                  <Youtube className="w-4 h-4" />
                  Клип
                </Button>
                <Button
                  variant={!showVideo ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-2",
                    !showVideo ? "bg-white text-black hover:bg-white/90" : "text-white hover:bg-white/10"
                  )}
                  onClick={() => setShowVideo(false)}
                >
                  <Music2 className="w-4 h-4" />
                  Обложка
                </Button>
              </div>

              <div className="w-12" /> {/* Spacer for balance */}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center Content */}
        <div className={cn("flex-1", showVideo ? "relative" : "flex items-center justify-center p-8 pt-24 pb-48")}>
          <AnimatePresence mode="wait">
            {showVideo ? (
              <motion.div
                key="video"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 w-full h-full"
              >
                {youtubeLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 text-white animate-spin" />
                      <p className="text-white/70 text-sm">Ищем клип на YouTube...</p>
                    </div>
                  </div>
                ) : youtubeVideoId && youtubeEmbedUrl ? (
                  <>
                    {!videoLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                        <Loader2 className="w-10 h-10 text-white animate-spin" />
                      </div>
                    )}
                    <iframe
                      ref={iframeRef}
                      key={`${youtubeVideoId}-${cacheKey}`}
                      src={youtubeEmbedUrl}
                      className="absolute inset-0 w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      onLoad={() => setVideoLoaded(true)}
                      title="YouTube video"
                    />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <div className="flex flex-col items-center gap-4 text-center px-8">
                      <Youtube className="w-16 h-16 text-white/30" />
                      <div>
                        <p className="text-white text-lg font-medium mb-1">Клип не найден</p>
                        <p className="text-white/60 text-sm">Попробуйте переключиться на обложку</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-white border-white/20 hover:bg-white/10"
                        onClick={() => setShowVideo(false)}
                      >
                        Показать обложку
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="artwork"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative"
              >
                {/* Vinyl effect */}
                <div className="relative">
                  {/* Glow effect */}
                  <div 
                    className={cn(
                      "absolute inset-0 rounded-full blur-3xl opacity-50 transition-opacity duration-1000",
                      isPlaying ? "opacity-50" : "opacity-20"
                    )}
                    style={{
                      background: `radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)`,
                    }}
                  />
                  
                  {/* Vinyl disc */}
                  <div
                    className={cn(
                      "relative w-[400px] h-[400px] rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 shadow-2xl flex items-center justify-center transition-transform duration-1000",
                      isPlaying && "animate-spin-slow"
                    )}
                    style={{
                      animationDuration: "8s",
                    }}
                  >
                    {/* Vinyl grooves */}
                    <div className="absolute inset-4 rounded-full border border-zinc-700/50" />
                    <div className="absolute inset-8 rounded-full border border-zinc-700/30" />
                    <div className="absolute inset-12 rounded-full border border-zinc-700/20" />
                    
                    {/* Center artwork */}
                    <div className="w-48 h-48 rounded-full overflow-hidden shadow-inner border-4 border-zinc-700">
                      {artworkUrl ? (
                        <img
                          src={artworkUrl}
                          alt={currentTrack.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                          <Music2 className="w-16 h-16 text-white/30" />
                        </div>
                      )}
                    </div>
                    
                    {/* Center hole */}
                    <div className="absolute w-4 h-4 rounded-full bg-black" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Controls */}
        <AnimatePresence>
          {controlsVisible && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black via-black/90 to-transparent"
            >
              {/* Track Info */}
              <div className="max-w-4xl mx-auto mb-6">
                <div className="flex items-center gap-6">
                  {/* Small artwork */}
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                    {artworkUrl ? (
                      <img src={artworkUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music2 className="w-8 h-8 text-white/30" />
                      </div>
                    )}
                  </div>
                  
                  {/* Title & Artist */}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold text-white truncate mb-1">
                      {currentTrack.title}
                    </h2>
                    <p className="text-white/60 text-lg truncate">
                      {currentTrack.user.username}
                    </p>
                  </div>

                  {/* Like/Dislike */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 text-white hover:bg-white/10"
                      onClick={handleDislike}
                    >
                      <ThumbsDown
                        className={cn(
                          "w-6 h-6 transition-all",
                          isDisliked && "text-primary scale-110"
                        )}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 text-white hover:bg-white/10"
                      onClick={handleLike}
                    >
                      <Heart
                        className={cn(
                          "w-6 h-6 transition-all",
                          isLiked && "fill-primary text-primary scale-110"
                        )}
                      />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="max-w-4xl mx-auto mb-6">
                <div className="flex items-center gap-4">
                  <span className="text-white/60 text-sm tabular-nums w-12 text-right">
                    {formatTime(currentTime)}
                  </span>
                  <div className="flex-1 relative group">
                    <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full transition-all duration-150"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      value={currentTime}
                      onChange={(e) => seek(Number(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-white/60 text-sm tabular-nums w-12">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="max-w-4xl mx-auto flex items-center justify-between">
                {/* Volume */}
                <div className="flex items-center gap-3 w-48">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-white hover:bg-white/10"
                    onClick={() => setVolume(volume > 0 ? 0 : 0.7)}
                  >
                    {volume === 0 ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </Button>
                  <div className="flex-1 relative group">
                    <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${volume * 100}%` }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume * 100}
                      onChange={(e) => setVolume(Number(e.target.value) / 100)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Main Controls */}
                <div className="flex items-center gap-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-14 w-14 text-white hover:bg-white/10"
                    onClick={previousTrack}
                  >
                    <SkipBack className="w-7 h-7" fill="currentColor" />
                  </Button>

                  <Button
                    size="icon"
                    className="h-16 w-16 rounded-full bg-white text-black hover:bg-white/90 hover:scale-105 transition-transform"
                    onClick={togglePlay}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-8 h-8" fill="currentColor" />
                    ) : (
                      <Play className="w-8 h-8 ml-1" fill="currentColor" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-14 w-14 text-white hover:bg-white/10"
                    onClick={nextTrack}
                  >
                    <SkipForward className="w-7 h-7" fill="currentColor" />
                  </Button>
                </div>

                {/* Queue */}
                <div className="flex items-center gap-3 w-48 justify-end">
                  {queue.length > 0 && (
                    <div className="flex items-center gap-2 text-white/60 text-sm">
                      <ListMusic className="w-5 h-5" />
                      <span>{queue.length} в очереди</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Keyboard hints */}
              <div className="max-w-4xl mx-auto mt-6 flex items-center justify-center gap-6 text-white/30 text-xs">
                <span>Space — пауза</span>
                <span>← → — перемотка</span>
                <span>↑ ↓ — громкость</span>
                <span>Esc — выйти</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Dialog для ручного ввода YouTube URL */}
      <Dialog open={showManualInput} onOpenChange={setShowManualInput}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить YouTube клип</DialogTitle>
            <DialogDescription>
              Вставьте YouTube URL или video ID для трека &quot;{currentTrack.title}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="https://youtube.com/watch?v=... или dQw4w9WgXcQ"
              value={manualInputValue}
              onChange={(e) => setManualInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleManualSubmit();
                }
              }}
              className="w-full"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowManualInput(false);
                  setManualInputValue("");
                }}
              >
                Отмена
              </Button>
              <Button onClick={handleManualSubmit}>
                Сохранить
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Поддерживаются форматы: youtube.com/watch?v=..., youtu.be/..., или просто video ID
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

