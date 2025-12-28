import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/MainLayout";
import MusicPlayer from "@/components/MusicPlayer";
import { trpc } from "@/lib/trpc";
import { User, Music2, Clock, Heart, LogOut, LogIn, ChevronRight, Play } from "lucide-react";
import { Link } from "wouter";

export default function Profile() {
  const { user, isAuthenticated, loading, logout } = useAuth();

  const { data: likedTracks } = trpc.preferences.getLikedTracks.useQuery(
    { limit: 100 },
    { enabled: isAuthenticated }
  );

  const { data: history } = trpc.history.get.useQuery(
    { limit: 100 },
    { enabled: isAuthenticated }
  );

  const { data: playlists } = trpc.playlists.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

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
              <User className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Войдите в аккаунт</h2>
            <p className="text-muted-foreground mb-6">
              Отслеживайте историю прослушивания и статистику
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
        <header className="bg-background border-b border-border">
          <div className="container py-8">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-2xl md:text-3xl font-semibold text-primary-foreground">
                  {(user?.name || "U").charAt(0).toUpperCase()}
                </span>
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-xl md:text-2xl font-semibold truncate">
                  {user?.name || "Пользователь"}
                </h1>
                <p className="text-sm text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
              
              {/* Logout */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => logout()}
                className="flex-shrink-0"
              >
                <LogOut className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Выйти</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="container py-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <StatCard 
              icon={Heart} 
              label="Избранное" 
              value={likedTracks?.length || 0} 
            />
            <StatCard 
              icon={Clock} 
              label="Прослушано" 
              value={history?.length || 0} 
            />
            <StatCard 
              icon={Music2} 
              label="Плейлисты" 
              value={playlists?.length || 0} 
            />
          </div>

          {/* Recent History */}
          {history && history.length > 0 && (
            <section className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-semibold">Недавно прослушанное</h2>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  Все
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              
              <div className="divide-y divide-border">
                {history.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 hover:bg-secondary/50 transition-colors cursor-pointer"
                  >
                    {/* Artwork */}
                    <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {item.track.artworkUrl ? (
                        <img 
                          src={item.track.artworkUrl} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Play className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.track.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.track.artist}</p>
                    </div>
                    
                    {/* Time */}
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatRelativeTime(new Date(item.playedAt))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Quick Links */}
          <section className="grid gap-3">
            <Link href="/library">
              <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Heart className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium">Избранные треки</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </Link>
            
            <Link href="/search">
              <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Music2 className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium">Найти новую музыку</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </Link>
          </section>
        </div>
      </div>

      <MusicPlayer />
    </MainLayout>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: number;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <Icon className="w-5 h-5 text-primary mx-auto mb-2" />
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Только что";
  if (minutes < 60) return `${minutes} мин.`;
  if (hours < 24) return `${hours} ч.`;
  if (days < 7) return `${days} дн.`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
