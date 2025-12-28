import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("preferences", () => {
  it("should set track preference to like", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.preferences.setPreference({
      soundcloudId: "123456",
      trackData: {
        title: "Test Track",
        artist: "Test Artist",
        artworkUrl: "https://example.com/artwork.jpg",
        duration: 180000,
        streamUrl: "https://example.com/stream",
        permalinkUrl: "https://soundcloud.com/test",
        genre: "Electronic",
      },
      preference: "like",
    });

    expect(result).toEqual({ success: true });
  });

  it("should set track preference to dislike", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.preferences.setPreference({
      soundcloudId: "789012",
      trackData: {
        title: "Another Track",
        artist: "Another Artist",
        artworkUrl: null,
        duration: 200000,
        permalinkUrl: "https://soundcloud.com/another",
        genre: null,
      },
      preference: "dislike",
    });

    expect(result).toEqual({ success: true });
  });

  it("should get user's liked tracks", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First, like a track
    await caller.preferences.setPreference({
      soundcloudId: "111111",
      trackData: {
        title: "Liked Track",
        artist: "Liked Artist",
        artworkUrl: null,
        duration: 150000,
        permalinkUrl: "https://soundcloud.com/liked",
        genre: "Pop",
      },
      preference: "like",
    });

    // Then get liked tracks
    const likedTracks = await caller.preferences.getLikedTracks({ limit: 10 });

    expect(Array.isArray(likedTracks)).toBe(true);
    expect(likedTracks.length).toBeGreaterThan(0);
  });
});

describe("playlists", () => {
  it("should create a playlist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const playlist = await caller.playlists.create({
      name: "My Test Playlist",
      description: "A playlist for testing",
      isPublic: false,
    });

    expect(playlist).toBeDefined();
    expect(playlist.name).toBe("My Test Playlist");
    expect(playlist.userId).toBe(ctx.user.id);
  });

  it("should list user playlists", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const playlists = await caller.playlists.list();

    expect(Array.isArray(playlists)).toBe(true);
  });

  it("should add track to playlist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a playlist
    const playlist = await caller.playlists.create({
      name: "Playlist for Tracks",
      isPublic: false,
    });

    // Add a track
    const result = await caller.playlists.addTrack({
      playlistId: playlist.id,
      soundcloudId: "222222",
      trackData: {
        title: "Playlist Track",
        artist: "Playlist Artist",
        artworkUrl: null,
        duration: 160000,
        permalinkUrl: "https://soundcloud.com/playlist-track",
        genre: "Rock",
      },
    });

    expect(result).toEqual({ success: true });
  });
});
