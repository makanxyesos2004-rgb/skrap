# SoundCloud API Integration Notes

## Authentication
- Uses `client_id` parameter for public API calls
- Base URL: `https://api.soundcloud.com`
- Client ID provided: `dH1Xed1fpITYonugor6sw39jvdq58M3h`

## Available Endpoints

### Search Endpoints (Public - requires client_id)
- `GET /tracks?q={query}&client_id={client_id}` - Search for tracks
- `GET /playlists?q={query}&client_id={client_id}` - Search for playlists
- `GET /users?q={query}&client_id={client_id}` - Search for users

### Track Endpoints
- `GET /tracks/{track_id}?client_id={client_id}` - Get track details
- `GET /tracks/{track_urn}/streams?client_id={client_id}` - Get streamable URLs
- `GET /tracks/{track_urn}/related?client_id={client_id}` - Get related tracks
- `GET /tracks/{track_urn}/comments?client_id={client_id}` - Get track comments

### Playlist Endpoints
- `GET /playlists/{playlist_urn}?client_id={client_id}` - Get playlist details
- `GET /playlists/{playlist_urn}/tracks?client_id={client_id}` - Get tracks in playlist

### User Endpoints
- `GET /users/{user_urn}?client_id={client_id}` - Get user details
- `GET /users/{user_urn}/tracks?client_id={client_id}` - Get user's tracks
- `GET /users/{user_urn}/playlists?client_id={client_id}` - Get user's playlists

### Resolve Endpoint
- `GET /resolve?url={soundcloud_url}&client_id={client_id}` - Convert SoundCloud URLs to API resources

## Response Format
- All responses are JSON
- Pagination supported with `limit` parameter (default: 50)
- Track objects include: title, duration, artwork_url, stream_url, permalink_url, genre, user info

## Implementation Strategy
1. Create backend service to proxy SoundCloud API requests
2. Cache track metadata in our database for faster access
3. Use related tracks endpoint for recommendation base
4. Store user preferences (likes/dislikes) to enhance recommendations
5. Track listening history to build personalized recommendations
