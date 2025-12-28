import { getRelatedTracks, searchTracks, SoundCloudTrackV2 } from './soundcloud';
import { getUserLikedTracks, getUserListeningHistory } from './db';

export interface RecommendedPlaylist {
  id: string;
  title: string;
  description?: string;
  tracks: SoundCloudTrackV2[];
}

/**
 * Генерация главной страницы с плейлистами (Home Feed)
 * Создает минимум 4 плейлиста по 25-30 треков.
 */
export async function generateHomeFeed(
  userId: number
): Promise<RecommendedPlaylist[]> {
  try {
    // 1. Получаем данные пользователя
    const [likedTracks, history] = await Promise.all([
      getUserLikedTracks(userId, 10),
      getUserListeningHistory(userId, 10)
    ]);

    const playlists: RecommendedPlaylist[] = [];
    const usedSeedIds = new Set<number>();

    // 2. Стратегия "Похоже на ваши лайки"
    // Берем до 2-х случайных лайкнутых треков и строим на их основе миксы
    if (likedTracks.length > 0) {
      const shuffledLikes = [...likedTracks].sort(() => 0.5 - Math.random());
      
      for (const track of shuffledLikes.slice(0, 2)) {
        if (usedSeedIds.has(track.id)) continue;
        
        const related = await getRelatedTracks(parseInt(track.soundcloudId), 30);
        if (related.length > 5) {
          playlists.push({
            id: `mix-like-${track.id}`,
            title: `Because you liked "${track.title}"`,
            description: "Based on your library",
            tracks: related
          });
          usedSeedIds.add(track.id);
        }
      }
    }

    // 3. Стратегия "Из истории прослушивания"
    // Берем последний трек из истории
    if (history.length > 0) {
       const lastPlayed = history[0].track;
       if (!usedSeedIds.has(lastPlayed.id)) {
         const related = await getRelatedTracks(parseInt(lastPlayed.soundcloudId), 30);
         if (related.length > 5) {
            playlists.push({
              id: `mix-history-${lastPlayed.id}`,
              title: `Jump back into "${lastPlayed.title}"`,
              description: "More like what you recently listened to",
              tracks: related
            });
            usedSeedIds.add(lastPlayed.id);
         }
       }
    }

    // 4. Заполняем недостающие слоты жанровыми подборками (Fallback)
    // Если плейлистов меньше 4, добавляем популярное
    const genreFallbacks = [
      { q: "Hip-hop", title: "Hip-Hop Essentials" },
      { q: "Electronic", title: "Electronic Vibes" },
      { q: "Pop", title: "Trending Pop" },
      { q: "Rock", title: "Rock Classics" },
      { q: "Indie", title: "Indie Discoveries" }
    ];

    let fallbackIndex = 0;
    while (playlists.length < 4 && fallbackIndex < genreFallbacks.length) {
      const genre = genreFallbacks[fallbackIndex];
      const tracks = await searchTracks(genre.q, 30); // Ищем 30 треков
      
      if (tracks.length > 0) {
        playlists.push({
          id: `mix-genre-${genre.q}`,
          title: genre.title,
          description: `Best of ${genre.q} on SoundCloud`,
          tracks: tracks
        });
      }
      fallbackIndex++;
    }

    return playlists;

  } catch (error) {
    console.error('Error generating home feed:', error);
    // В случае критической ошибки возвращаем хотя бы что-то
    try {
        const fallback = await searchTracks("Top 50", 30);
        return [{ id: "fallback", title: "Top Tracks", tracks: fallback }];
    } catch {
        return [];
    }
  }
}

// Оставляем старые функции для совместимости (если они используются где-то еще)
export async function getTrackBasedRecommendations(
  trackId: string,
  limit: number = 10
): Promise<SoundCloudTrackV2[]> {
  try {
    return await getRelatedTracks(parseInt(trackId), limit);
  } catch (error) {
    return [];
  }
}