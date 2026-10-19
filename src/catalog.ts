import spotifyUrlInfo from 'spotify-url-info';
import type { CatalogId } from '../shared/services';

/**
 * Catalog services (Spotify, Apple Music) list tracks but serve no downloadable
 * media. Each track becomes a SoundCloud search, which yt-dlp resolves.
 */
export interface CatalogTrack {
  title: string;
  artist: string;
}

export interface CatalogResult {
  title: string;
  artist?: string;
  thumbnail?: string;
  tracks: CatalogTrack[];
}

export const searchQuery = (t: CatalogTrack) =>
  `scsearch5:${t.artist} - ${t.title}`;
/** "Title - Artist", the naming the library already uses. */
export const trackLabel = (t: CatalogTrack) =>
  t.artist ? `${t.title} - ${t.artist}` : t.title;

const spotify = spotifyUrlInfo(fetch);

async function resolveSpotify(url: string): Promise<CatalogResult> {
  const data = await spotify.getDetails(url);
  const tracks = (data.tracks ?? []).map(t => ({
    title: t.name,
    artist: t.artist ?? '',
  }));
  return {
    title: data.preview?.title || 'Spotify',
    artist:
      data.preview?.type === 'playlist' ? undefined : data.preview?.artist,
    thumbnail: data.preview?.image,
    tracks,
  };
}

// Apple Music --------------------------------------------------------------

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

interface AppleLockup {
  title?: string;
  artistName?: string;
  contentDescriptor?: { identifiers?: { storeAdamID?: string } };
  subtitleLinks?: { title?: string }[] | null;
  artwork?: { dictionary?: { url?: string } };
}

interface AppleSection {
  itemKind?: string;
  items?: AppleLockup[];
}

const artworkUrl = (template?: string) =>
  template?.replace('{w}x{h}', '600x600').replace('{f}', 'jpg');

function jsonLd(html: string): Record<string, unknown>[] {
  return [
    ...html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
    ),
  ].flatMap(m => {
    try {
      return [JSON.parse(m[1] ?? '')];
    } catch {
      return [];
    }
  });
}

const firstName = (v: unknown): string | undefined =>
  Array.isArray(v)
    ? (v[0] as { name?: string })?.name
    : (v as { name?: string })?.name;

/** Exported for tests. Reads the server-rendered data Apple embeds in every page. */
export function parseApplePage(html: string, pageUrl: string): CatalogResult {
  const songId = new URL(pageUrl).searchParams.get('i');
  const serialized = html.match(
    /<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/
  )?.[1];

  if (serialized) {
    const parsed = JSON.parse(serialized);
    const sections: AppleSection[] =
      (Array.isArray(parsed) ? parsed[0] : parsed)?.data?.[0]?.data?.sections ??
      [];
    const header = sections.find(
      s => s.itemKind === 'containerDetailHeaderLockup'
    )?.items?.[0];
    const lockups =
      sections.find(s => s.itemKind === 'trackLockup')?.items ?? [];
    const headerArtist = header?.subtitleLinks?.[0]?.title;

    let tracks = lockups.map(l => ({
      id: l.contentDescriptor?.identifiers?.storeAdamID,
      title: l.title ?? '',
      artist: l.artistName || headerArtist || '',
    }));
    if (songId) tracks = tracks.filter(t => t.id === songId);
    tracks = tracks.filter(t => t.title);

    if (tracks.length > 0) {
      return {
        title: songId
          ? (tracks[0]?.title ?? '')
          : header?.title || 'Apple Music',
        artist: songId ? tracks[0]?.artist : headerArtist,
        thumbnail: artworkUrl(header?.artwork?.dictionary?.url),
        tracks: tracks.map(({ title, artist }) => ({ title, artist })),
      };
    }
  }

  // /song/ pages carry no track list; JSON-LD has the single recording.
  const song = jsonLd(html).find(
    d => d['@type'] === 'MusicComposition' || d['@type'] === 'MusicRecording'
  );
  if (song?.name) {
    const audio = song.audio as { byArtist?: unknown } | undefined;
    const artist = firstName(song.byArtist) ?? firstName(audio?.byArtist) ?? '';
    return {
      title: String(song.name),
      artist,
      thumbnail: typeof song.image === 'string' ? song.image : undefined,
      tracks: [{ title: String(song.name), artist }],
    };
  }

  throw new Error(
    'Apple Music page had no track list. Apple may have changed the page layout.'
  );
}

async function resolveApple(url: string): Promise<CatalogResult> {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US' },
  });
  if (!res.ok) throw new Error(`Apple Music returned ${res.status}`);
  return parseApplePage(await res.text(), url);
}

export function resolveCatalog(
  catalog: CatalogId,
  url: string
): Promise<CatalogResult> {
  return catalog === 'spotify' ? resolveSpotify(url) : resolveApple(url);
}
