import { Play, Pause, MoreHorizontal, PlusCircle, Heart, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMusicPlayer, Track } from "@/contexts/MusicPlayerContext";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface TrackCardProps {
  track: Track;
  playlistContext?: Track[];
  indexInPlaylist?: number;
  variant?: "default" | "compact" | "list";
}

export default function TrackCard({ 
  track, 
  playlistContext, 
  indexInPlaylist,
  variant = "default" 
}: TrackCardProps) {
  const { currentTrack, isPlaying, playTrack, playPlaylist, togglePlay, addToQueue, preloadTracks } = useMusicPlayer();
  const [isHovered, setIsHovered] = useState(false);
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const setPreferenceMutation = trpc.preferences.setPreference.useMutation({
    onSuccess: () => {
      utils.preferences.getPreference.invalidate();
      utils.preferences.getLikedTracks.invalidate();
    },
  });

  const setPreference = (preference: "like" | "dislike") => {
    if (!isAuthenticated) {
      toast.error("Войдите, чтобы улучшать рекомендации");
      return;
    }
    setPreferenceMutation.mutate({
      soundcloudId: track.id.toString(),
      trackData: {
        title: track.title,
        artist: track.user.username,
        artworkUrl: track.artwork_url,
        duration: track.duration,
        streamUrl: track.stream_url,
        permalinkUrl: track.permalink_url,
        genre: track.genre,
      },
      preference,
    });
    toast.success(preference === "like" ? "Добавлено в избранное" : "Помечено как «Не нравится»");
  };

  const isCurrentTrack = currentTrack?.id === track.id;
  const isCurrentPlaying = isCurrentTrack && isPlaying;

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isCurrentTrack) {
      togglePlay();
    } else {
      if (playlistContext && typeof indexInPlaylist === 'number') {
        playPlaylist(playlistContext, indexInPlaylist);
      } else {
        playTrack(track);
      }
    }
  };

  const artworkUrl = track.artwork_url 
    ? track.artwork_url.replace("-large", "-t500x500") 
    : track.user.avatar_url;

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // List variant (for library/search results)
  if (variant === "list") {
    return (
      <div 
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer group",
          "hover:bg-secondary/50",
          isCurrentTrack && "bg-secondary"
        )}
        onClick={handlePlayClick}
        onMouseEnter={() => {
          setIsHovered(true);
          preloadTracks([track]);
        }}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => preloadTracks([track])}
      >
        {/* Artwork */}
        <div className="relative w-12 h-12 rounded-md overflow-hidden bg-secondary flex-shrink-0">
          {artworkUrl ? (
            <img src={artworkUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          {/* Play overlay */}
          <div className={cn(
            "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
            isCurrentPlaying || isHovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}>
            {isCurrentPlaying ? (
              <Pause className="w-5 h-5 text-white" fill="white" />
            ) : (
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            "font-medium text-sm truncate",
            isCurrentTrack && "text-primary"
          )}>
            {track.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">{track.user.username}</p>
        </div>

        {/* Duration */}
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDuration(track.duration)}
        </span>

        {/* Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); addToQueue(track); }}>
              <PlusCircle className="mr-2 h-4 w-4" /> В очередь
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPreference("like"); }}>
              <Heart className="mr-2 h-4 w-4" /> В избранное
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPreference("dislike"); }}>
              <ThumbsDown className="mr-2 h-4 w-4" /> Не нравится
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Default card variant
  return (
    <div 
      className="group cursor-pointer"
      onMouseEnter={() => {
        setIsHovered(true);
        preloadTracks([track]);
      }}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handlePlayClick}
      onTouchStart={() => preloadTracks([track])}
    >
      {/* Artwork Container */}
      <div className="relative aspect-square rounded-lg overflow-hidden bg-secondary mb-3">
        {artworkUrl ? (
          <img 
            src={artworkUrl} 
            alt={track.title} 
            className={cn(
              "w-full h-full object-cover transition-transform duration-300",
              (isHovered || isCurrentPlaying) && "scale-105"
            )}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-secondary">
            <Play className="w-10 h-10 text-muted-foreground/30" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent transition-opacity duration-200",
          (isHovered || isCurrentPlaying) ? "opacity-100" : "opacity-0"
        )} />

        {/* Play Button */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-center transition-all duration-200",
          (isHovered || isCurrentPlaying) ? "opacity-100" : "opacity-0"
        )}>
          <Button
            size="icon"
            className={cn(
              "h-12 w-12 rounded-full shadow-lg transition-all",
              "bg-primary hover:bg-primary hover:scale-105",
              (isHovered || isCurrentPlaying) ? "translate-y-0" : "translate-y-2"
            )}
            onClick={handlePlayClick}
          >
            {isCurrentPlaying ? (
              <Pause className="h-5 w-5" fill="currentColor" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" fill="currentColor" />
            )}
          </Button>
        </div>

        {/* Menu Button */}
        <div className={cn(
          "absolute top-2 right-2 transition-opacity duration-200",
          isHovered ? "opacity-100" : "opacity-0"
        )}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="secondary" 
                size="icon" 
                className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white border-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); addToQueue(track); }}>
                <PlusCircle className="mr-2 h-4 w-4" /> Добавить в очередь
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPreference("like"); }}>
                <Heart className="mr-2 h-4 w-4" /> В избранное
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPreference("dislike"); }}>
                <ThumbsDown className="mr-2 h-4 w-4" /> Не нравится
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Track Info */}
      <div className="space-y-1">
        <p className={cn(
          "font-medium text-sm leading-tight line-clamp-2",
          isCurrentTrack && "text-primary"
        )}>
          {track.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {track.user.username}
        </p>
      </div>
    </div>
  );
}
