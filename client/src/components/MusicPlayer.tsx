import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Heart, 
  ChevronDown, ListMusic, Repeat, Shuffle, Share2, MoreHorizontal,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";

export default function MusicPlayer() {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    volume,
    currentTime,
    duration,
    queue,
    togglePlay,
    seek,
    setVolume,
    nextTrack,
    previousTrack,
  } = useMusicPlayer();

  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: preference } = trpc.preferences.getPreference.useQuery(
    { soundcloudId: currentTrack?.id.toString() || "" },
    { enabled: isAuthenticated && !!currentTrack }
  );

  const setPreferenceMutation = trpc.preferences.setPreference.useMutation({
    onSuccess: () => {
      utils.preferences.getPreference.invalidate();
      utils.preferences.getLikedTracks.invalidate();
    },
  });

  const removePreferenceMutation = trpc.preferences.removePreference.useMutation({
    onSuccess: () => {
      utils.preferences.getPreference.invalidate();
      utils.preferences.getLikedTracks.invalidate();
    },
  });

  const isLiked = preference === "like";

  const handleLike = async () => {
    if (!currentTrack) return;
    
    if (!isAuthenticated) {
      toast.error("Войдите, чтобы добавлять в избранное");
      return;
    }

    try {
      if (isLiked) {
        await removePreferenceMutation.mutateAsync({
          soundcloudId: currentTrack.id.toString(),
        });
        toast.success("Удалено из избранного");
      } else {
        await setPreferenceMutation.mutateAsync({
          soundcloudId: currentTrack.id.toString(),
          trackData: {
            title: currentTrack.title,
            artist: currentTrack.user.username,
            artworkUrl: currentTrack.artwork_url,
            duration: currentTrack.duration,
            streamUrl: currentTrack.stream_url,
            permalinkUrl: currentTrack.permalink_url,
            genre: currentTrack.genre,
          },
          preference: "like",
        });
        toast.success("Добавлено в избранное");
      }
    } catch (error) {
      toast.error("Ошибка обновления");
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSeek = (value: number[]) => {
    if (value[0] !== undefined) {
      seek(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    if (value[0] !== undefined) {
      setVolume(value[0] / 100);
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Close expanded player on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  if (!currentTrack) return null;

  const artworkUrl = currentTrack.artwork_url?.replace("-large", "-t500x500") || null;
  const artworkSmall = currentTrack.artwork_url?.replace("-large", "-t200x200") || null;

  // Mini player for mobile (when not expanded)
  const MiniPlayer = (
    <div 
      className="md:hidden fixed bottom-[56px] left-0 right-0 bg-card border-t border-border z-40"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Progress bar at top */}
      <div className="h-0.5 bg-secondary">
        <div 
          className="h-full bg-primary transition-all duration-150" 
          style={{ width: `${progress}%` }} 
        />
      </div>
      
      <div className="flex items-center gap-3 p-3">
        {/* Artwork - tap to expand */}
        <Drawer open={isExpanded} onOpenChange={setIsExpanded}>
          <DrawerTrigger asChild>
            <button className="relative w-12 h-12 rounded-md overflow-hidden bg-secondary flex-shrink-0 active:scale-95 transition-transform">
              {artworkSmall ? (
                <img src={artworkSmall} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Play className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </button>
          </DrawerTrigger>
          <DrawerContent className="h-[100dvh] bg-background">
            <FullPlayer 
              currentTrack={currentTrack}
              artworkUrl={artworkUrl}
              isPlaying={isPlaying}
              isLoading={isLoading}
              isLiked={isLiked}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              queue={queue}
              formatTime={formatTime}
              togglePlay={togglePlay}
              previousTrack={previousTrack}
              nextTrack={nextTrack}
              handleLike={handleLike}
              handleSeek={handleSeek}
              handleVolumeChange={handleVolumeChange}
              onClose={() => setIsExpanded(false)}
            />
          </DrawerContent>
        </Drawer>

        {/* Track Info */}
        <div className="flex-1 min-w-0" onClick={() => setIsExpanded(true)}>
          <p className="font-medium text-sm truncate">{currentTrack.title}</p>
          <p className="text-xs text-muted-foreground truncate">{currentTrack.user.username}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10"
            onClick={handleLike}
          >
            <Heart
              className={cn(
                "w-5 h-5",
                isLiked && "fill-primary text-primary"
              )}
            />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10"
            onClick={togglePlay}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" fill="currentColor" />
            ) : (
              <Play className="w-5 h-5" fill="currentColor" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10"
            onClick={nextTrack}
          >
            <SkipForward className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );

  // Desktop player bar
  const DesktopPlayer = (
    <div className="hidden md:block fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="h-20 px-4 flex items-center gap-4">
        {/* Track Info */}
        <div className="flex items-center gap-3 w-[280px] flex-shrink-0">
          <div className="w-14 h-14 rounded-md bg-secondary flex-shrink-0 overflow-hidden">
            {artworkSmall ? (
              <img src={artworkSmall} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Play className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{currentTrack.title}</p>
            <p className="text-xs text-muted-foreground truncate">{currentTrack.user.username}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleLike}
          >
            <Heart
              className={cn(
                "w-4 h-4",
                isLiked && "fill-primary text-primary"
              )}
            />
          </Button>
        </div>

        {/* Center Controls */}
        <div className="flex-1 flex flex-col items-center gap-1.5 max-w-2xl mx-auto">
          {/* Buttons */}
          <div className="flex items-center gap-4">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={previousTrack}
            >
              <SkipBack className="w-5 h-5" />
            </Button>
            
            <Button
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={togglePlay}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4" fill="currentColor" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
              )}
            </Button>
            
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={nextTrack}
            >
              <SkipForward className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="w-full flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-10 text-right tabular-nums">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="flex-1"
            />
            <span className="text-[11px] text-muted-foreground w-10 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right Controls - Volume */}
        <div className="flex items-center gap-2 w-[200px] justify-end">
          {queue.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
              <ListMusic className="w-4 h-4" />
              <span>{queue.length}</span>
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setVolume(volume > 0 ? 0 : 0.7)}
          >
            {volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </Button>
          <Slider
            value={[volume * 100]}
            max={100}
            step={1}
            onValueChange={handleVolumeChange}
            className="w-24"
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {MiniPlayer}
      {DesktopPlayer}
    </>
  );
}

// Full screen player component for mobile
interface FullPlayerProps {
  currentTrack: any;
  artworkUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  isLiked: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  queue: any[];
  formatTime: (s: number) => string;
  togglePlay: () => void;
  previousTrack: () => void;
  nextTrack: () => void;
  handleLike: () => void;
  handleSeek: (value: number[]) => void;
  handleVolumeChange: (value: number[]) => void;
  onClose: () => void;
}

function FullPlayer({
  currentTrack,
  artworkUrl,
  isPlaying,
  isLoading,
  isLiked,
  currentTime,
  duration,
  queue,
  formatTime,
  togglePlay,
  previousTrack,
  nextTrack,
  handleLike,
  handleSeek,
  onClose,
}: FullPlayerProps) {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 flex-shrink-0">
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-10 w-10"
          onClick={onClose}
        >
          <ChevronDown className="w-6 h-6" />
        </Button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Сейчас играет</p>
        </div>
        <Button size="icon" variant="ghost" className="h-10 w-10">
          <MoreHorizontal className="w-5 h-5" />
        </Button>
      </div>

      {/* Artwork */}
      <div className="flex-1 flex items-center justify-center px-8 py-4">
        <div className="w-full max-w-[320px] aspect-square rounded-xl overflow-hidden bg-secondary shadow-2xl">
          {artworkUrl ? (
            <img 
              src={artworkUrl} 
              alt={currentTrack.title} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Track Info & Controls */}
      <div className="flex-shrink-0 px-6 pb-8 space-y-6">
        {/* Title & Artist */}
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold truncate">{currentTrack.title}</h2>
            <p className="text-muted-foreground truncate">{currentTrack.user.username}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-12 w-12 flex-shrink-0"
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

        {/* Progress */}
        <div className="space-y-2">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={1}
            onValueChange={handleSeek}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Main Controls */}
        <div className="flex items-center justify-center gap-8">
          <Button
            size="icon"
            variant="ghost"
            className="h-14 w-14 text-muted-foreground"
          >
            <Shuffle className="w-5 h-5" />
          </Button>
          
          <Button
            size="icon"
            variant="ghost"
            className="h-14 w-14"
            onClick={previousTrack}
          >
            <SkipBack className="w-7 h-7" fill="currentColor" />
          </Button>
          
          <Button
            size="icon"
            className="h-16 w-16 rounded-full"
            onClick={togglePlay}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-7 h-7" fill="currentColor" />
            ) : (
              <Play className="w-7 h-7 ml-1" fill="currentColor" />
            )}
          </Button>
          
          <Button
            size="icon"
            variant="ghost"
            className="h-14 w-14"
            onClick={nextTrack}
          >
            <SkipForward className="w-7 h-7" fill="currentColor" />
          </Button>
          
          <Button
            size="icon"
            variant="ghost"
            className="h-14 w-14 text-muted-foreground"
          >
            <Repeat className="w-5 h-5" />
          </Button>
        </div>

        {/* Queue indicator */}
        {queue.length > 0 && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ListMusic className="w-4 h-4" />
            <span>В очереди: {queue.length} трек(ов)</span>
          </div>
        )}
      </div>
    </div>
  );
}
