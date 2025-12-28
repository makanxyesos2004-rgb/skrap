import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MainLayout from "@/components/MainLayout";
import MusicPlayer from "@/components/MusicPlayer";
import { trpc } from "@/lib/trpc";
import TrackCard from "@/components/TrackCard";
import PlaylistCard from "@/components/PlaylistCard";
import { Music2, ListMusic, Heart, Clock, LogIn } from "lucide-react";
import { Track } from "@/contexts/MusicPlayerContext";

export default function Library() {
  const { isAuthenticated, loading } = useAuth();

  const { data: likedTracks, isLoading: likedLoading } = trpc.preferences.getLikedTracks.useQuery(
    { limit: 100 },
    { enabled: isAuthenticated }
  );

  const { data: playlists, isLoading: playlistsLoading } = trpc.playlists.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Transform liked tracks to proper Track format
  const transformedTracks: Track[] = likedTracks?.map((track) => ({
    id: parseInt(track.soundcloudId),
    title: track.title,
    user: { id: 0, username: track.artist, avatar_url: null },
    artwork_url: track.artworkUrl ?? null,
    duration: track.duration,
    permalink_url: track.permalinkUrl ?? '',
    genre: track.genre ?? null,
    created_at: track.createdAt.toISOString(),
  })) ?? [];

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
              <Music2 className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Войдите в аккаунт</h2>
            <p className="text-muted-foreground mb-6">
              Сохраняйте любимые треки и создавайте плейлисты
            </p>
            <Button asChild size="lg" className="w-full">
              <Link href="/login">
                <LogIn className="w-4 h-4 mr-2" />
                Войти
              </Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen pb-40 md:pb-28">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="container py-4 md:py-6">
            <h1 className="text-2xl md:text-3xl font-semibold">Медиатека</h1>
          </div>
        </header>

        <div className="container py-4">
          <Tabs defaultValue="liked" className="w-full">
            <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex h-auto p-1 bg-secondary rounded-lg mb-6">
              <TabsTrigger 
                value="liked" 
                className="flex items-center gap-2 px-4 py-2.5 data-[state=active]:bg-background rounded-md"
              >
                <Heart className="w-4 h-4" />
                <span>Избранное</span>
                {likedTracks && likedTracks.length > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {likedTracks.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="playlists"
                className="flex items-center gap-2 px-4 py-2.5 data-[state=active]:bg-background rounded-md"
              >
                <ListMusic className="w-4 h-4" />
                <span>Плейлисты</span>
              </TabsTrigger>
            </TabsList>

            {/* Liked Tracks */}
            <TabsContent value="liked" className="mt-0">
              {likedLoading ? (
                <LoadingSkeleton />
              ) : likedTracks && likedTracks.length > 0 ? (
                <div className="space-y-6">
                  {/* Quick stats */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Heart className="w-4 h-4" />
                      {likedTracks.length} трек(ов)
                    </span>
                  </div>

                  {/* Grid for larger screens */}
                  <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {transformedTracks.map((track, index) => (
                      <TrackCard
                        key={track.id}
                        track={track}
                        playlistContext={transformedTracks}
                        indexInPlaylist={index}
                      />
                    ))}
                  </div>

                  {/* List for mobile */}
                  <div className="sm:hidden space-y-1">
                    {transformedTracks.map((track, index) => (
                      <TrackCard
                        key={track.id}
                        track={track}
                        variant="list"
                        playlistContext={transformedTracks}
                        indexInPlaylist={index}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState 
                  icon={Heart}
                  title="Нет избранных треков"
                  description="Ставьте лайки трекам, чтобы они появились здесь"
                />
              )}
            </TabsContent>

            {/* Playlists */}
            <TabsContent value="playlists" className="mt-0">
              {playlistsLoading ? (
                <LoadingSkeleton />
              ) : playlists && playlists.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {playlists.map((playlist) => (
                    <PlaylistCard key={playlist.id} playlist={playlist} />
                  ))}
                </div>
              ) : (
                <EmptyState 
                  icon={ListMusic}
                  title="Нет плейлистов"
                  description="Создайте свой первый плейлист"
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <MusicPlayer />
    </MainLayout>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="aspect-square bg-secondary rounded-lg skeleton-shimmer" />
          <div className="h-4 w-3/4 bg-secondary rounded skeleton-shimmer" />
          <div className="h-3 w-1/2 bg-secondary rounded skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ 
  icon: Icon, 
  title, 
  description 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
