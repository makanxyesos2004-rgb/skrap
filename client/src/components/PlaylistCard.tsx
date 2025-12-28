import { Play, MoreVertical, Lock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Playlist {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PlaylistCardProps {
  playlist: Playlist;
  className?: string;
}

export default function PlaylistCard({ playlist, className }: PlaylistCardProps) {
  return (
    <div
      className={cn(
        "group bg-card border border-border rounded-xl p-4 transition-all hover:bg-secondary/50 cursor-pointer card-hover",
        className
      )}
    >
      {/* Playlist Cover */}
      <div className="relative aspect-square mb-4 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-4xl font-bold text-primary/40">
            {playlist.name.charAt(0).toUpperCase()}
          </div>
        </div>
        
        {/* Play Button on Hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
          >
            <Play className="h-5 w-5 ml-0.5" fill="currentColor" />
          </Button>
        </div>
      </div>

      {/* Playlist Info */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm truncate flex-1" title={playlist.name}>
            {playlist.name}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-7 w-7 opacity-0 group-hover:opacity-100 flex-shrink-0"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Редактировать</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Удалить</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {playlist.description && (
          <p className="text-xs text-muted-foreground line-clamp-2" title={playlist.description}>
            {playlist.description}
          </p>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
          {playlist.isPublic ? (
            <>
              <Globe className="w-3 h-3" />
              <span>Публичный</span>
            </>
          ) : (
            <>
              <Lock className="w-3 h-3" />
              <span>Приватный</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
