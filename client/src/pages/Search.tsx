import { useState, useEffect, useRef } from "react";
import { Search as SearchIcon, X, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import MainLayout from "@/components/MainLayout";
import MusicPlayer from "@/components/MusicPlayer";
import { trpc } from "@/lib/trpc";
import TrackCard from "@/components/TrackCard";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";

const TRENDING_SEARCHES = [
  "Hip-hop", "Electronic", "Lo-fi", "Jazz", "Rock", "Indie", "Pop", "R&B"
];

export default function Search() {
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { preloadTracks } = useMusicPlayer();

  const { data: tracks, isLoading } = trpc.search.tracks.useQuery(
    { query: searchQuery, limit: 30 },
    { enabled: searchQuery.length > 0 }
  );
  
  // Предзагружаем первые треки сразу при появлении результатов
  useEffect(() => {
    if (tracks && tracks.length > 0) {
      // Предзагружаем первые 5 треков для мгновенного воспроизведения
      preloadTracks(tracks.slice(0, 5));
    }
  }, [tracks, preloadTracks]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchQuery(query.trim());
    }
  };

  const handleQuickSearch = (term: string) => {
    setQuery(term);
    setSearchQuery(term);
  };

  const clearSearch = () => {
    setQuery("");
    setSearchQuery("");
    inputRef.current?.focus();
  };

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <MainLayout>
      <div className="min-h-screen pb-40 md:pb-28">
        {/* Search Header - Sticky */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border">
          <div className="container py-4">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Найти треки, исполнителей..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-12 pr-12 h-12 text-base bg-secondary border-0 rounded-xl placeholder:text-muted-foreground"
                />
                {query && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={clearSearch}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </form>
          </div>
        </header>

        <div className="container py-6">
          {/* Initial State - Show Trending */}
          {!searchQuery && (
            <div className="space-y-8">
              <section>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Популярные жанры
                </h2>
                <div className="flex flex-wrap gap-2">
                  {TRENDING_SEARCHES.map((term) => (
                    <Button
                      key={term}
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      onClick={() => handleQuickSearch(term)}
                    >
                      {term}
                    </Button>
                  ))}
                </div>
              </section>

              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <SearchIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">
                  Ищите любимые треки и исполнителей
                </p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="mt-4 text-sm text-muted-foreground">Ищем...</p>
            </div>
          )}

          {/* Results */}
          {tracks && tracks.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Результаты по запросу «{searchQuery}»
                </h2>
                <span className="text-sm text-muted-foreground">
                  {tracks.length} трек(ов)
                </span>
              </div>
              
              {/* Grid for larger screens, list for mobile */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {tracks.map((track) => (
                  <TrackCard key={track.id} track={track} />
                ))}
              </div>
              
              {/* List for mobile */}
              <div className="sm:hidden space-y-1">
                {tracks.map((track) => (
                  <TrackCard key={track.id} track={track} variant="list" />
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {tracks && tracks.length === 0 && searchQuery && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                <SearchIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">Ничего не найдено</h3>
              <p className="text-sm text-muted-foreground mb-6">
                По запросу «{searchQuery}» ничего не нашлось
              </p>
              <Button variant="outline" onClick={clearSearch}>
                Новый поиск
              </Button>
            </div>
          )}
        </div>
      </div>

      <MusicPlayer />
    </MainLayout>
  );
}
