import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, unique, index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tracks that users have interacted with (liked/disliked)
 * Stores SoundCloud track metadata for quick access
 */
export const tracks = mysqlTable("tracks", {
  id: int("id").autoincrement().primaryKey(),
  soundcloudId: varchar("soundcloudId", { length: 255 }).notNull().unique(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  artworkUrl: text("artworkUrl"),
  duration: int("duration").notNull(), // in milliseconds
  streamUrl: text("streamUrl"),
  permalinkUrl: text("permalinkUrl"),
  genre: varchar("genre", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  soundcloudIdIdx: index("soundcloud_id_idx").on(table.soundcloudId),
}));

export type Track = typeof tracks.$inferSelect;
export type InsertTrack = typeof tracks.$inferInsert;

/**
 * User's track preferences (likes/dislikes)
 */
export const trackPreferences = mysqlTable("track_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  trackId: int("trackId").notNull(),
  preference: mysqlEnum("preference", ["like", "dislike"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userTrackUnique: unique("user_track_unique").on(table.userId, table.trackId),
  userIdIdx: index("user_id_idx").on(table.userId),
  trackIdIdx: index("track_id_idx").on(table.trackId),
}));

export type TrackPreference = typeof trackPreferences.$inferSelect;
export type InsertTrackPreference = typeof trackPreferences.$inferInsert;

/**
 * User's listening history
 */
export const listeningHistory = mysqlTable("listening_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  trackId: int("trackId").notNull(),
  playedAt: timestamp("playedAt").defaultNow().notNull(),
  playDuration: int("playDuration"), // how long they listened in milliseconds
}, (table) => ({
  userIdIdx: index("user_id_idx").on(table.userId),
  playedAtIdx: index("played_at_idx").on(table.playedAt),
}));

export type ListeningHistory = typeof listeningHistory.$inferSelect;
export type InsertListeningHistory = typeof listeningHistory.$inferInsert;

/**
 * User-created playlists
 */
export const playlists = mysqlTable("playlists", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isPublic: boolean("isPublic").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_id_idx").on(table.userId),
}));

export type Playlist = typeof playlists.$inferSelect;
export type InsertPlaylist = typeof playlists.$inferInsert;

/**
 * Tracks within playlists
 */
export const playlistTracks = mysqlTable("playlist_tracks", {
  id: int("id").autoincrement().primaryKey(),
  playlistId: int("playlistId").notNull(),
  trackId: int("trackId").notNull(),
  position: int("position").notNull(), // order in playlist
  addedAt: timestamp("addedAt").defaultNow().notNull(),
}, (table) => ({
  playlistIdIdx: index("playlist_id_idx").on(table.playlistId),
  playlistTrackUnique: unique("playlist_track_position_unique").on(table.playlistId, table.position),
}));

export type PlaylistTrack = typeof playlistTracks.$inferSelect;
export type InsertPlaylistTrack = typeof playlistTracks.$inferInsert;
