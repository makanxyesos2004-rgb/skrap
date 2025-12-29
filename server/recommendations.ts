import { getRelatedTracks, searchTracks, SoundCloudTrackV2 } from './soundcloud';
import { getUserDislikedSoundcloudIds, getUserListeningHistory, getUserTrackPreferencesDetailed } from './db';

export interface RecommendedPlaylist {
  id: string;
  title: string;
  description?: string;
  tracks: SoundCloudTrackV2[];
}

const HOME_FEED_TTL_MS = 2 * 60 * 1000; // Уменьшено до 2 минут для более частого обновления
const homeFeedCache = new Map<number, { 
  expires: number; 
  data: RecommendedPlaylist[];
  shownTrackIds: Set<number>; // Треки, которые уже были показаны
}>();

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
 * Взвешенный случайный выбор из массива кандидатов
 * Использует веса для вероятности выбора, но добавляет случайность
 */
function weightedRandomSelect<T extends { score: number }>(
  candidates: T[],
  count: number,
  randomnessFactor: number = 0.3
): T[] {
  if (candidates.length <= count) return [...candidates];
  
  // Нормализуем веса
  const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
  if (totalScore === 0) {
    // Если все веса нулевые, выбираем случайно
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  const selected: T[] = [];
  const used = new Set<number>();

  for (let i = 0; i < count && selected.length < count; i++) {
    const available = candidates.filter((_, idx) => !used.has(idx));
    if (available.length === 0) break;

    // Смешиваем детерминированный выбор с случайностью
    // randomnessFactor = 0.3 означает 30% случайности, 70% по весам
    const useRandom = Math.random() < randomnessFactor;
    
    let chosen: T;
    if (useRandom) {
      // Полностью случайный выбор
      const randomIdx = Math.floor(Math.random() * available.length);
      chosen = available[randomIdx];
    } else {
      // Взвешенный выбор среди доступных
      const availableTotalScore = available.reduce((sum, c) => sum + c.score, 0);
      if (availableTotalScore === 0) {
        // Если все веса нулевые, выбираем случайно
        const randomIdx = Math.floor(Math.random() * available.length);
        chosen = available[randomIdx];
      } else {
        const weights = available.map(c => c.score / availableTotalScore);
        const random = Math.random();
        let cumulative = 0;
        chosen = available[available.length - 1]; // Fallback
        for (let j = 0; j < available.length; j++) {
          cumulative += weights[j];
          if (random <= cumulative) {
            chosen = available[j];
            break;
          }
        }
      }
    }

    selected.push(chosen);
    const originalIdx = candidates.indexOf(chosen);
    used.add(originalIdx);
  }

  return selected;
}

/**
 * Генерация главной страницы с плейлистами (Home Feed)
 * Создает минимум 4 плейлиста по 25-30 треков.
 */
export async function generateHomeFeed(
  userId: number,
  forceRefresh: boolean = false
): Promise<RecommendedPlaylist[]> {
  const cached = homeFeedCache.get(userId);
  if (!forceRefresh && cached && cached.expires > Date.now()) {
    return cached.data;
  }

  // Получаем уже показанные треки из предыдущего кэша для исключения
  const previouslyShown = cached?.shownTrackIds ?? new Set<number>();

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

    // Выбираем больше жанров и артистов для ротации
    const allGenres = [...genreScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([g, score]) => ({ genre: g, score }));
    
    const allArtists = [...artistScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([a, score]) => ({ artist: a, score }));

    // Взвешенный случайный выбор жанров (2-3 из топ-5)
    const selectedGenres = weightedRandomSelect(
      allGenres.slice(0, Math.min(5, allGenres.length)),
      Math.min(3, allGenres.length),
      0.4 // 40% случайности для разнообразия
    ).map(g => g.genre);

    // Взвешенный случайный выбор артистов (1-2 из топ-4)
    const selectedArtists = weightedRandomSelect(
      allArtists.slice(0, Math.min(4, allArtists.length)),
      Math.min(2, allArtists.length),
      0.4
    ).map(a => a.artist);

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

    // Взвешенный случайный выбор seed треков для разнообразия
    // Берем из топ-10 кандидатов, выбираем 3 случайно с учетом весов
    const validCandidates = candidates
      .filter(c => !dislikedIds.has(c.soundcloudId))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Рассматриваем топ-10

    const seeds = weightedRandomSelect(
      validCandidates,
      Math.min(3, validCandidates.length),
      0.35 // 35% случайности - баланс между релевантностью и разнообразием
    );

    const playlists: RecommendedPlaylist[] = [];
    const usedGlobal = new Set<number>(); // SoundCloud track ids across all playlists
    // Добавляем ранее показанные треки в исключения
    for (const id of previouslyShown) {
      usedGlobal.add(id);
    }

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
    for (const g of selectedGenres) {
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
    for (const a of selectedArtists) {
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

    // Собираем все показанные треки для следующей генерации
    const shownTrackIds = new Set<number>();
    for (const p of playlists) {
      for (const t of p.tracks) {
        shownTrackIds.add(t.id);
      }
    }

    homeFeedCache.set(userId, { 
      expires: Date.now() + HOME_FEED_TTL_MS, 
      data: playlists,
      shownTrackIds 
    });
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
      const shownTrackIds = new Set(safe.map(t => t.id));
      homeFeedCache.set(userId, { 
        expires: Date.now() + HOME_FEED_TTL_MS, 
        data,
        shownTrackIds 
      });
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