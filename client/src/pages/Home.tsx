import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/MainLayout";
import MusicPlayer from "@/components/MusicPlayer";
import TrackCard from "@/components/TrackCard";
import { trpc } from "@/lib/trpc";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { Music2, Sparkles, PlayCircle, ArrowRight, ChevronRight, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const { preloadTracks } = useMusicPlayer();

  const [refreshKey, setRefreshKey] = useState(0);
  const { data: playlists, isLoading: recsLoading } = trpc.recommendations.personalized.useQuery(
    { forceRefresh: refreshKey > 0 }, 
    { enabled: isAuthenticated }
  );

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Предзагружаем первые треки из каждого плейлиста при получении данных
  useEffect(() => {
    if (playlists && playlists.length > 0) {
      // Собираем первые 3 трека из каждого плейлиста
      const tracksToPreload = playlists.flatMap(p => p.tracks.slice(0, 3));
      preloadTracks(tracksToPreload);
    }
  }, [playlists, preloadTracks]);

  // Get current hour for greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Доброе утро";
    if (hour < 18) return "Добрый день";
    return "Добрый вечер";
  };

  return (
    <MainLayout>
      <div className="min-h-screen pb-40 md:pb-28">
        {/* Authenticated User View */}
        {isAuthenticated && (
          <>
            {/* Header with Greeting */}
            <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
              <div className="container py-4 md:py-6 flex items-center justify-between">
                <h1 className="text-2xl md:text-3xl font-semibold">{getGreeting()}</h1>
                {playlists && playlists.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={recsLoading}
                    className="gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${recsLoading ? 'animate-spin' : ''}`} />
                    Обновить
                  </Button>
                )}
              </div>
            </header>

            {/* Content */}
            <div className="container py-6 space-y-10">
              {recsLoading ? (
                // Loading State
                <div className="space-y-10">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-4">
                      <div className="h-7 w-48 bg-secondary rounded-md skeleton-shimmer" />
                      <div className="h-4 w-32 bg-secondary rounded-md skeleton-shimmer" />
                      <div className="flex gap-4 overflow-hidden">
                        {[1, 2, 3, 4, 5].map((j) => (
                          <div 
                            key={j} 
                            className="w-[160px] md:w-[180px] flex-shrink-0 space-y-3"
                          >
                            <div className="aspect-square bg-secondary rounded-lg skeleton-shimmer" />
                            <div className="h-4 w-3/4 bg-secondary rounded skeleton-shimmer" />
                            <div className="h-3 w-1/2 bg-secondary rounded skeleton-shimmer" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : playlists && playlists.length > 0 ? (
                // Playlists
                <div className="space-y-10">
                  {playlists.map((playlist, playlistIndex) => (
                    <section 
                      key={playlist.id} 
                      className="animate-in fade-in slide-in-from-bottom-4 duration-500"
                      style={{ animationDelay: `${playlistIndex * 100}ms` }}
                    >
                      {/* Section Header */}
                      <div className="flex items-end justify-between mb-4">
                        <div>
                          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
                            {playlist.title}
                          </h2>
                          {playlist.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {playlist.description}
                            </p>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-muted-foreground hover:text-foreground gap-1 hidden md:flex"
                        >
                          Показать все
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      {/* Horizontal Scroll Track List */}
                      <div className="relative -mx-4 px-4 md:-mx-8 md:px-8">
                        <div 
                          className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide"
                          style={{ 
                            scrollSnapType: 'x mandatory',
                            WebkitOverflowScrolling: 'touch'
                          }}
                        >
                          {playlist.tracks.map((track, index) => (
                            <div 
                              key={track.id} 
                              className="w-[160px] md:w-[180px] flex-shrink-0"
                              style={{ scrollSnapAlign: 'start' }}
                            >
                              <TrackCard 
                                track={track} 
                                playlistContext={playlist.tracks}
                                indexInPlaylist={index}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                // Empty State
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-6">
                    <Music2 className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Пока нет рекомендаций</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm">
                    Начните слушать и ставить лайки, чтобы мы подобрали музыку под ваш вкус
                  </p>
                  <Button asChild>
                    <Link href="/search">
                      <Sparkles className="w-4 h-4 mr-2" />
                      Найти музыку
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Non-Authenticated User View */}
        {!isAuthenticated && !loading && (
          <div className="min-h-screen flex flex-col">
            {/* Hero */}
            <div className="flex-1 flex items-center justify-center px-6 py-20">
              <div className="text-center max-w-2xl">
                {/* Logo */}
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary mb-8">
                  <Music2 className="w-10 h-10 text-primary-foreground" />
                </div>
                
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-6">
                  Музыка для <br className="hidden sm:block" />
                  <span className="text-primary">каждого момента</span>
                </h1>
                
                <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-lg mx-auto">
                  Миллионы треков с SoundCloud. Персональные плейлисты. Умные рекомендации.
                </p>
                
                <Button asChild size="lg" className="h-12 px-8 text-base font-medium">
                  <Link href="/login">
                    Начать бесплатно
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Features */}
            <div className="bg-secondary/30 border-t border-border">
              <div className="container py-16 md:py-20">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
                  <div className="text-center md:text-left">
                    <div className="inline-flex w-12 h-12 rounded-xl bg-primary/10 items-center justify-center mb-4">
                      <PlayCircle className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Безграничное прослушивание</h3>
                    <p className="text-muted-foreground text-sm">
                      Стримьте музыку в высоком качестве без рекламы и ограничений
                    </p>
                  </div>

                  <div className="text-center md:text-left">
                    <div className="inline-flex w-12 h-12 rounded-xl bg-primary/10 items-center justify-center mb-4">
                      <Sparkles className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Умные миксы</h3>
                    <p className="text-muted-foreground text-sm">
                      Персональные плейлисты на основе ваших предпочтений
                    </p>
                  </div>

                  <div className="text-center md:text-left">
                    <div className="inline-flex w-12 h-12 rounded-xl bg-primary/10 items-center justify-center mb-4">
                      <Music2 className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Ваша медиатека</h3>
                    <p className="text-muted-foreground text-sm">
                      Сохраняйте любимые треки и создавайте свои плейлисты
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="min-h-screen flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            </div>
          </div>
        )}
      </div>

      <MusicPlayer />
    </MainLayout>
  );
}
