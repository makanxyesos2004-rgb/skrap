import { getRelatedTracks, searchTracks, SoundCloudTrackV2 } from './soundcloud';
import { getUserDislikedSoundcloudIds, getUserListeningHistory, getUserTrackPreferencesDetailed } from './db';

export interface RecommendedPlaylist {
  id: string;
  title: string;
  description?: string;
  tracks: SoundCloudTrackV2[];
}

const HOME_FEED_TTL_MS = 10 * 60 * 1000;
const homeFeedCache = new Map<number, { expires: number; data: RecommendedPlaylist[] }>();

function timeDecayFactor(date: Date, halfLifeDays: number = 14): number {
  const ageDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  const hl = Math.max(1, halfLifeDays);
  // exp decay to [0..1]
  return Math.exp(-Math.max(0, ageDays) / hl);
}

function pushScore(map: Map<string, number>, key: string | null | undefined, add: number) {
  if (!key) return;
  const k = key.trim();
  if (!k) return;
  map.set(k, (map.get(k) ?? 0) + add);
}

function diversifyByArtist(tracks: SoundCloudTrackV2[], maxPerArtist: number): SoundCloudTrackV2[] {
  const counts = new Map<string, number>();
  const out: SoundCloudTrackV2[] = [];

  for (const t of tracks) {
    const artist = t.user?.username ?? "unknown";
    const current = counts.get(artist) ?? 0;
    if (current >= maxPerArtist) continue;
    counts.set(artist, current + 1);
    out.push(t);
  }

  return out;
}

function filterAndDedupeTracks(options: {
  tracks: SoundCloudTrackV2[];
  excludeIds: Set<number>;
  dislikedIds: Set<number>;
  maxPerArtist: number;
  limit: number;
}): SoundCloudTrackV2[] {
  const seen = new Set<number>();
  const filtered: SoundCloudTrackV2[] = [];

  for (const t of options.tracks) {
    if (!t || typeof t.id !== "number") continue;
    if (options.dislikedIds.has(t.id)) continue;
    if (options.excludeIds.has(t.id)) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    filtered.push(t);
  }

  return diversifyByArtist(filtered, options.maxPerArtist).slice(0, options.limit);
}

/**
 * Генерация главной страницы с плейлистами (Home Feed)
 * Создает минимум 4 плейлиста по 25-30 треков.
 */
export async function generateHomeFeed(
  userId: number
): Promise<RecommendedPlaylist[]> {
  const cached = homeFeedCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    // 1) Данные пользователя: лайки/дизлайки + история с playDuration
    const [prefs, history, dislikedSoundcloudIds] = await Promise.all([
      getUserTrackPreferencesDetailed(userId, 200),
      getUserListeningHistory(userId, 50),
      getUserDislikedSoundcloudIds(userId, 500),
    ]);

    const dislikedIds = new Set<number>(
      dislikedSoundcloudIds
        .map(s => Number.parseInt(s, 10))
        .filter(n => Number.isFinite(n))
    );

    const liked = prefs.filter(p => p.preference === "like");

    // 2) Профиль вкуса: жанры/артисты (веса по давности и дослушиванию)
    const genreScores = new Map<string, number>();
    const artistScores = new Map<string, number>();

    for (const p of liked) {
      const w = 3 * timeDecayFactor(p.createdAt, 21);
      pushScore(genreScores, p.track.genre ?? null, w);
      pushScore(artistScores, p.track.artist ?? null, w);
    }

    for (const h of history) {
      const playedMs = h.playDuration ?? 0;
      const completion = h.track.duration > 0 ? Math.max(0, Math.min(1, playedMs / h.track.duration)) : 0;
      const w = 2 * completion * timeDecayFactor(h.playedAt, 10);
      pushScore(genreScores, h.track.genre ?? null, w);
      pushScore(artistScores, h.track.artist ?? null, w);
    }

    const topGenres = [...genreScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([g]) => g);

    const topArtists = [...artistScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([a]) => a);

    // 3) Выбор seed треков (взвешенно)
    type Seed = { soundcloudId: number; title: string; reason: string; score: number };
    const candidates: Seed[] = [];

    for (const p of liked) {
      const scId = Number.parseInt(p.track.soundcloudId, 10);
      if (!Number.isFinite(scId)) continue;
      candidates.push({
        soundcloudId: scId,
        title: p.track.title,
        reason: "like",
        score: 5 * timeDecayFactor(p.createdAt, 21),
      });
    }

    for (const h of history) {
      const scId = Number.parseInt(h.track.soundcloudId, 10);
      if (!Number.isFinite(scId)) continue;
      const playedMs = h.playDuration ?? 0;
      const completion = h.track.duration > 0 ? Math.max(0, Math.min(1, playedMs / h.track.duration)) : 0;
      candidates.push({
        soundcloudId: scId,
        title: h.track.title,
        reason: "history",
        score: 3 * completion * timeDecayFactor(h.playedAt, 10),
      });
    }

    const seeds: Seed[] = [];
    const usedSeed = new Set<number>();
    for (const c of candidates.sort((a, b) => b.score - a.score)) {
      if (seeds.length >= 3) break;
      if (dislikedIds.has(c.soundcloudId)) continue;
      if (usedSeed.has(c.soundcloudId)) continue;
      usedSeed.add(c.soundcloudId);
      seeds.push(c);
    }

    const playlists: RecommendedPlaylist[] = [];
    const usedGlobal = new Set<number>(); // SoundCloud track ids across all playlists

    const pushPlaylist = (p: RecommendedPlaylist) => {
      if (p.tracks.length < 12) return;
      playlists.push(p);
      for (const t of p.tracks) usedGlobal.add(t.id);
    };

    // 4) Плейлисты по seed (related) — параллельно
    const relatedLists = await Promise.all(
      seeds.map(async (s) => {
        try {
          const related = await getRelatedTracks(s.soundcloudId, 40);
          return { seed: s, related };
        } catch {
          return { seed: s, related: [] as SoundCloudTrackV2[] };
        }
      })
    );

    for (const { seed, related } of relatedLists) {
      const filtered = filterAndDedupeTracks({
        tracks: related,
        excludeIds: usedGlobal,
        dislikedIds,
        maxPerArtist: 2,
        limit: 30,
      });

      const title =
        seed.reason === "like"
          ? `Потому что вам понравилось «${seed.title}»`
          : `Продолжайте слушать «${seed.title}»`;

      pushPlaylist({
        id: `mix-seed-${seed.reason}-${seed.soundcloudId}`,
        title,
        description: "Подборка по вашему вкусу",
        tracks: filtered,
      });
    }

    // 5) Жанровые подборки под пользователя
    for (const g of topGenres) {
      if (playlists.length >= 5) break;
      try {
        const tracks = await searchTracks(g, 40);
        const filtered = filterAndDedupeTracks({
          tracks,
          excludeIds: usedGlobal,
          dislikedIds,
          maxPerArtist: 2,
          limit: 30,
        });
        pushPlaylist({
          id: `mix-genre-${g}`,
          title: `Ваш жанр: ${g}`,
          description: "Треки по вашим предпочтениям",
          tracks: filtered,
        });
      } catch {
        // ignore
      }
    }

    // 6) Плейлист по артистам (поиск по имени артиста)
    for (const a of topArtists) {
      if (playlists.length >= 5) break;
      try {
        const tracks = await searchTracks(a, 40);
        const filtered = filterAndDedupeTracks({
          tracks,
          excludeIds: usedGlobal,
          dislikedIds,
          maxPerArtist: 3,
          limit: 25,
        });
        pushPlaylist({
          id: `mix-artist-${a}`,
          title: `Если нравится ${a}`,
          description: "Похожие исполнители и треки",
          tracks: filtered,
        });
      } catch {
        // ignore
      }
    }

    // 7) Фолбэки, если мало данных
    const genreFallbacks = [
      { q: "Hip-hop", title: "Хип-хоп: лучшее" },
      { q: "Electronic", title: "Электроника: вайбы" },
      { q: "Pop", title: "Поп: в тренде" },
      { q: "Rock", title: "Рок: классика" },
      { q: "Indie", title: "Инди: открытия" },
    ];

    let fallbackIndex = 0;
    while (playlists.length < 4 && fallbackIndex < genreFallbacks.length) {
      const f = genreFallbacks[fallbackIndex];
      try {
        const tracks = await searchTracks(f.q, 40);
        const filtered = filterAndDedupeTracks({
          tracks,
          excludeIds: usedGlobal,
          dislikedIds,
          maxPerArtist: 2,
          limit: 30,
        });
        pushPlaylist({
          id: `mix-fallback-${f.q}`,
          title: f.title,
          description: "Подборка на сегодня",
          tracks: filtered,
        });
      } catch {
        // ignore
      }
      fallbackIndex++;
    }

    homeFeedCache.set(userId, { expires: Date.now() + HOME_FEED_TTL_MS, data: playlists });
    return playlists;
  } catch (error) {
    console.error('Error generating home feed:', error);
    try {
      const fallback = await searchTracks("Top 50", 30);
      const safe = filterAndDedupeTracks({
        tracks: fallback,
        excludeIds: new Set<number>(),
        dislikedIds: new Set<number>(),
        maxPerArtist: 2,
        limit: 30,
      });
      const data = [{ id: "fallback", title: "Топ треков", tracks: safe }];
      homeFeedCache.set(userId, { expires: Date.now() + HOME_FEED_TTL_MS, data });
      return data;
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