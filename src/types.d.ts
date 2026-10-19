declare module 'spotify-url-info' {
  interface SpotifyTrack {
    name: string;
    artist?: string;
    duration?: number;
  }
  interface SpotifyDetails {
    preview?: {
      title?: string;
      type?: string;
      artist?: string;
      image?: string;
    };
    tracks?: SpotifyTrack[];
  }
  interface SpotifyClient {
    getDetails(url: string): Promise<SpotifyDetails>;
    getTracks(url: string): Promise<SpotifyTrack[]>;
  }
  export default function spotifyUrlInfo(
    fetch: typeof globalThis.fetch
  ): SpotifyClient;
}
