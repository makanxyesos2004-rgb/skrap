import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { 
  InsertUser, users, 
  tracks, Track, InsertTrack,
  trackPreferences, TrackPreference, InsertTrackPreference,
  listeningHistory, ListeningHistory, InsertListeningHistory,
  playerEvents, InsertPlayerEvent,
  playlists, Playlist, InsertPlaylist,
  playlistTracks, PlaylistTrack, InsertPlaylistTrack
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        // ИЗМЕНЕНИЕ: Ставим false. Это работает и с TiDB, и с локальным MySQL
        ssl: { rejectUnauthorized: false },
        connectionLimit: 10,
      });
      
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ User Functions ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============ Track Functions ============

export async function upsertTrack(track: InsertTrack): Promise<Track> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(tracks)
    .where(eq(tracks.soundcloudId, track.soundcloudId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0]!;
  }

  const result = await db.insert(tracks).values(track);
  const insertedId = Number(result[0].insertId);

  const inserted = await db
    .select()
    .from(tracks)
    .where(eq(tracks.id, insertedId))
    .limit(1);

  return inserted[0]!;
}

export async function getTrackBySoundcloudId(soundcloudId: string): Promise<Track | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(tracks)
    .where(eq(tracks.soundcloudId, soundcloudId))
    .limit(1);

  return result[0];
}

export async function getTrackById(trackId: number): Promise<Track | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);

  return result[0];
}

// ============ Track Preference Functions ============

export async function setTrackPreference(
  userId: number,
  trackId: number,
  preference: "like" | "dislike"
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(trackPreferences)
    .values({ userId, trackId, preference })
    .onDuplicateKeyUpdate({
      set: { preference, updatedAt: new Date() },
    });
}

export async function removeTrackPreference(userId: number, trackId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(trackPreferences)
    .where(and(eq(trackPreferences.userId, userId), eq(trackPreferences.trackId, trackId)));
}

export async function getUserTrackPreference(
  userId: number,
  trackId: number
): Promise<TrackPreference | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(trackPreferences)
    .where(and(eq(trackPreferences.userId, userId), eq(trackPreferences.trackId, trackId)))
    .limit(1);

  return result[0];
}

export async function getUserLikedTracks(userId: number, limit: number = 50): Promise<Track[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({ track: tracks })
    .from(trackPreferences)
    .innerJoin(tracks, eq(trackPreferences.trackId, tracks.id))
    .where(and(eq(trackPreferences.userId, userId), eq(trackPreferences.preference, "like")))
    .orderBy(desc(trackPreferences.createdAt))
    .limit(limit);

  return result.map((r) => r.track);
}

export type UserTrackPreferenceDetailed = {
  track: Track;
  preference: "like" | "dislike";
  createdAt: Date;
};

export async function getUserTrackPreferencesDetailed(
  userId: number,
  limit: number = 200
): Promise<UserTrackPreferenceDetailed[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      track: tracks,
      preference: trackPreferences.preference,
      createdAt: trackPreferences.createdAt,
    })
    .from(trackPreferences)
    .innerJoin(tracks, eq(trackPreferences.trackId, tracks.id))
    .where(eq(trackPreferences.userId, userId))
    .orderBy(desc(trackPreferences.createdAt))
    .limit(limit);

  return result.map(r => ({
    track: r.track,
    preference: r.preference,
    createdAt: r.createdAt,
  }));
}

export async function getUserDislikedSoundcloudIds(
  userId: number,
  limit: number = 500
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({ soundcloudId: tracks.soundcloudId })
    .from(trackPreferences)
    .innerJoin(tracks, eq(trackPreferences.trackId, tracks.id))
    .where(and(eq(trackPreferences.userId, userId), eq(trackPreferences.preference, "dislike")))
    .orderBy(desc(trackPreferences.createdAt))
    .limit(limit);

  return result.map(r => r.soundcloudId);
}

// ============ Listening History Functions ============

export async function addListeningHistory(history: InsertListeningHistory): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(listeningHistory).values(history);
}

// ============ Player Events (Analytics) ============

export async function addPlayerEvent(event: InsertPlayerEvent): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(playerEvents).values(event);
  } catch (error) {
    // Analytics must never break the app (e.g. when migrations weren't applied yet)
    console.warn("[Database] Failed to insert player event:", error);
  }
}

export async function getUserListeningHistory(
  userId: number,
  limit: number = 50
): Promise<(ListeningHistory & { track: Track })[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      history: listeningHistory,
      track: tracks,
    })
    .from(listeningHistory)
    .innerJoin(tracks, eq(listeningHistory.trackId, tracks.id))
    .where(eq(listeningHistory.userId, userId))
    .orderBy(desc(listeningHistory.playedAt))
    .limit(limit);

  return result.map((r) => ({ ...r.history, track: r.track }));
}

// ============ Playlist Functions ============

export async function createPlaylist(playlist: InsertPlaylist): Promise<Playlist> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(playlists).values(playlist);
  const insertedId = Number(result[0].insertId);

  const inserted = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, insertedId))
    .limit(1);

  return inserted[0]!;
}

export async function getUserPlaylists(userId: number): Promise<Playlist[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(playlists)
    .where(eq(playlists.userId, userId))
    .orderBy(desc(playlists.createdAt));
}

export async function getPlaylistById(playlistId: number): Promise<Playlist | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);

  return result[0];
}

export async function updatePlaylist(
  playlistId: number,
  updates: Partial<Pick<Playlist, "name" | "description" | "isPublic">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(playlists)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(playlists.id, playlistId));
}

export async function deletePlaylist(playlistId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete playlist tracks first
  await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, playlistId));
  // Then delete the playlist
  await db.delete(playlists).where(eq(playlists.id, playlistId));
}

// ============ Playlist Track Functions ============

export async function addTrackToPlaylist(
  playlistId: number,
  trackId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the next position
  const maxPosition = await db
    .select({ max: sql<number>`MAX(${playlistTracks.position})` })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId));

  const nextPosition = (maxPosition[0]?.max ?? -1) + 1;

  await db.insert(playlistTracks).values({
    playlistId,
    trackId,
    position: nextPosition,
  });
}

export async function removeTrackFromPlaylist(
  playlistId: number,
  trackId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(playlistTracks)
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)));
}

export async function getPlaylistTracks(playlistId: number): Promise<Track[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({ track: tracks })
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .where(eq(playlistTracks.playlistId, playlistId))
    .orderBy(playlistTracks.position);

  return result.map((r) => r.track);
}

export async function reorderPlaylistTracks(
  playlistId: number,
  trackIds: number[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete existing tracks
  await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, playlistId));

  // Insert in new order
  const values = trackIds.map((trackId, index) => ({
    playlistId,
    trackId,
    position: index,
  }));

  if (values.length > 0) {
    await db.insert(playlistTracks).values(values);
  }
}