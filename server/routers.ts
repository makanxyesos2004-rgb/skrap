import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as soundcloud from "./soundcloud";
import * as db from "./db";
import { generateHomeFeed, getTrackBasedRecommendations } from "./recommendations";
import { sdk } from "./_core/sdk";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm"; 
import { users } from "../drizzle/schema"; 

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    
    login: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        const database = await import("./db").then(m => m.getDb());
        if (!database) throw new Error("Database unavailable");

        let user = await database.select().from(users).where(eq(users.email, input.email)).then(res => res[0]);

        if (!user) {
          const openId = nanoid();
          await database.insert(users).values({
            email: input.email,
            name: input.email.split('@')[0],
            openId: openId,
            role: "user",
          });
          user = await database.select().from(users).where(eq(users.email, input.email)).then(res => res[0]);
        }

        // Используем sdk для создания токена сессии
        const token = await sdk.createSessionToken(user.openId, {
          name: user.name || "User",
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });

        return { success: true, user };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  search: router({
    tracks: publicProcedure
      .input(z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
      }))
      .query(async ({ input }) => {
        return await soundcloud.searchTracks(input.query, input.limit);
      }),

    playlists: publicProcedure
      .input(z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
      }))
      .query(async ({ input }) => {
        return await soundcloud.searchPlaylists(input.query, input.limit);
      }),
  }),

  tracks: router({
    get: publicProcedure
      .input(z.object({ trackId: z.number() }))
      .query(async ({ input }) => {
        return await soundcloud.getTrack(input.trackId);
      }),

    getStreamUrl: publicProcedure
      .input(z.object({ trackId: z.number() }))
      .query(async ({ input }) => {
        return await soundcloud.getStreamUrl(input.trackId);
      }),

    related: publicProcedure
      .input(z.object({
        trackId: z.number(),
        limit: z.number().min(1).max(20).default(10),
      }))
      .query(async ({ input }) => {
        return await soundcloud.getRelatedTracks(input.trackId, input.limit);
      }),
  }),

  preferences: router({
    setPreference: protectedProcedure
      .input(z.object({
        soundcloudId: z.string(),
        trackData: z.object({
          title: z.string(),
          artist: z.string(),
          artworkUrl: z.string().nullable(),
          duration: z.number(),
          streamUrl: z.string().nullable().optional(),
          permalinkUrl: z.string(),
          genre: z.string().nullable(),
        }),
        preference: z.enum(["like", "dislike"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const track = await db.upsertTrack({
          soundcloudId: input.soundcloudId,
          title: input.trackData.title,
          artist: input.trackData.artist,
          artworkUrl: input.trackData.artworkUrl,
          duration: input.trackData.duration,
          streamUrl: input.trackData.streamUrl ?? null,
          permalinkUrl: input.trackData.permalinkUrl,
          genre: input.trackData.genre,
        });

        await db.setTrackPreference(ctx.user.id, track.id, input.preference);
        return { success: true };
      }),

    removePreference: protectedProcedure
      .input(z.object({ soundcloudId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const track = await db.getTrackBySoundcloudId(input.soundcloudId);
        if (!track) {
          throw new Error("Track not found");
        }

        await db.removeTrackPreference(ctx.user.id, track.id);
        return { success: true };
      }),

    getPreference: protectedProcedure
      .input(z.object({ soundcloudId: z.string() }))
      .query(async ({ ctx, input }) => {
        const track = await db.getTrackBySoundcloudId(input.soundcloudId);
        if (!track) return null;

        const preference = await db.getUserTrackPreference(ctx.user.id, track.id);
        return preference?.preference ?? null;
      }),

    getLikedTracks: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
      .query(async ({ ctx, input }) => {
        return await db.getUserLikedTracks(ctx.user.id, input.limit);
      }),
  }),

  history: router({
    add: protectedProcedure
      .input(z.object({
        soundcloudId: z.string(),
        trackData: z.object({
          title: z.string(),
          artist: z.string(),
          artworkUrl: z.string().nullable(),
          duration: z.number(),
          streamUrl: z.string().nullable().optional(),
          permalinkUrl: z.string(),
          genre: z.string().nullable(),
        }),
        playDuration: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const track = await db.upsertTrack({
          soundcloudId: input.soundcloudId,
          title: input.trackData.title,
          artist: input.trackData.artist,
          artworkUrl: input.trackData.artworkUrl,
          duration: input.trackData.duration,
          streamUrl: input.trackData.streamUrl ?? null,
          permalinkUrl: input.trackData.permalinkUrl,
          genre: input.trackData.genre,
        });

        await db.addListeningHistory({
          userId: ctx.user.id,
          trackId: track.id,
          playDuration: input.playDuration,
        });

        return { success: true };
      }),

    get: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
      .query(async ({ ctx, input }) => {
        return await db.getUserListeningHistory(ctx.user.id, input.limit);
      }),
  }),

  playlists: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        isPublic: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createPlaylist({
          userId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          isPublic: input.isPublic,
        });
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserPlaylists(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ playlistId: z.number() }))
      .query(async ({ ctx, input }) => {
        const playlist = await db.getPlaylistById(input.playlistId);
        if (!playlist) {
          throw new Error("Playlist not found");
        }
        if (playlist.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        const tracks = await db.getPlaylistTracks(input.playlistId);
        return { ...playlist, tracks };
      }),

    update: protectedProcedure
      .input(z.object({
        playlistId: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        isPublic: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const playlist = await db.getPlaylistById(input.playlistId);
        if (!playlist || playlist.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        const { playlistId, ...updates } = input;
        await db.updatePlaylist(playlistId, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ playlistId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const playlist = await db.getPlaylistById(input.playlistId);
        if (!playlist || playlist.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        await db.deletePlaylist(input.playlistId);
        return { success: true };
      }),

    addTrack: protectedProcedure
      .input(z.object({
        playlistId: z.number(),
        soundcloudId: z.string(),
        trackData: z.object({
          title: z.string(),
          artist: z.string(),
          artworkUrl: z.string().nullable(),
          duration: z.number(),
          streamUrl: z.string().nullable().optional(),
          permalinkUrl: z.string(),
          genre: z.string().nullable(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const playlist = await db.getPlaylistById(input.playlistId);
        if (!playlist || playlist.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        const track = await db.upsertTrack({
          soundcloudId: input.soundcloudId,
          title: input.trackData.title,
          artist: input.trackData.artist,
          artworkUrl: input.trackData.artworkUrl,
          duration: input.trackData.duration,
          streamUrl: input.trackData.streamUrl ?? null,
          permalinkUrl: input.trackData.permalinkUrl,
          genre: input.trackData.genre,
        });

        await db.addTrackToPlaylist(input.playlistId, track.id);
        return { success: true };
      }),

    removeTrack: protectedProcedure
      .input(z.object({
        playlistId: z.number(),
        soundcloudId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const playlist = await db.getPlaylistById(input.playlistId);
        if (!playlist || playlist.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        const track = await db.getTrackBySoundcloudId(input.soundcloudId);
        if (!track) {
          throw new Error("Track not found");
        }

        await db.removeTrackFromPlaylist(input.playlistId, track.id);
        return { success: true };
      }),
  }),

  // ИСПРАВЛЕНИЕ 2: Используем новую логику рекомендаций
  recommendations: router({
    personalized: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(30).optional() }))
      .query(async ({ ctx }) => {
        // Теперь здесь возвращаются плейлисты
        return await generateHomeFeed(ctx.user.id);
      }),

    forTrack: publicProcedure
      .input(z.object({
        trackId: z.string(),
        limit: z.number().min(1).max(20).default(10),
      }))
      .query(async ({ input }) => {
        return await getTrackBasedRecommendations(input.trackId, input.limit);
      }),
  }),
});

export type AppRouter = typeof appRouter;