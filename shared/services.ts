import type { Format } from './schemas';

export type ServiceId =
  | 'youtube'
  | 'youtube-music'
  | 'tiktok'
  | 'soundcloud'
  | 'spotify'
  | 'apple-music'
  | 'vimeo'
  | 'reddit'
  | 'x'
  | 'twitch'
  | 'bandcamp'
  | 'mixcloud'
  | 'archive'
  | 'dailymotion'
  | 'bilibili'
  | 'generic';

/** Catalog services list tracks but serve no media; each track is looked up on SoundCloud. */
export type CatalogId = 'spotify' | 'apple';

export interface Embed {
  src: string;
  /** Fixed player height in px; omitted means a 16:9 frame. */
  height?: number;
}

export interface Service {
  id: ServiceId;
  label: string;
  hosts: string[];
  defaultFormat: Format;
  audioOnly?: boolean;
  catalog?: CatalogId;
  /** Swatch for the source badge. Never used as a surface color. */
  color: string;
  /**
   * Whether the URL points at many items (playlist, album, channel).
   * Absent means "let yt-dlp decide".
   */
  isCollection?: (u: URL) => boolean;
  embed?: (u: URL) => Embed | null;
}

const segments = (u: URL) => u.pathname.split('/').filter(Boolean);

const youtubeId = (u: URL): string | null => {
  const v = u.searchParams.get('v');
  if (v) return v;
  if (u.hostname === 'youtu.be') return segments(u)[0] ?? null;
  const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/);
  return m?.[1] ?? null;
};

const youtubeEmbed = (u: URL): Embed | null => {
  const id = youtubeId(u);
  return id ? { src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
};

const youtubeCollection = (u: URL) =>
  u.pathname.startsWith('/playlist') ||
  (!!u.searchParams.get('list') && !youtubeId(u)) ||
  /^\/(@|channel\/|c\/|user\/)/.test(u.pathname);

const soundcloudPlayer = (u: URL, height: number): Embed => ({
  src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.href)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_reposts=false&show_teaser=false`,
  height,
});

export const SERVICES: Service[] = [
  // Order matters: music.youtube.com must match before youtube.com.
  {
    id: 'youtube-music',
    label: 'YouTube Music',
    hosts: ['music.youtube.com'],
    defaultFormat: 'mp3',
    color: '#ff0033',
    isCollection: youtubeCollection,
    embed: youtubeEmbed,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
    defaultFormat: 'mp4',
    color: '#ff0033',
    isCollection: youtubeCollection,
    embed: youtubeEmbed,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    hosts: ['tiktok.com'],
    defaultFormat: 'mp4',
    color: '#25f4ee',
    isCollection: u =>
      u.pathname.startsWith('/@') && !/\/(video|photo)\//.test(u.pathname),
    embed: u => {
      const id = u.pathname.match(/\/video\/(\d+)/)?.[1];
      return id ? { src: `https://www.tiktok.com/embed/v2/${id}` } : null;
    },
  },
  {
    id: 'soundcloud',
    label: 'SoundCloud',
    hosts: ['soundcloud.com'],
    defaultFormat: 'wav',
    audioOnly: true,
    color: '#ff5500',
    isCollection: u =>
      u.pathname.includes('/sets/') ||
      (u.hostname !== 'on.soundcloud.com' && segments(u).length === 1),
    embed: u => soundcloudPlayer(u, u.pathname.includes('/sets/') ? 300 : 166),
  },
  {
    id: 'spotify',
    label: 'Spotify',
    hosts: ['open.spotify.com', 'spotify.com'],
    defaultFormat: 'mp3',
    audioOnly: true,
    catalog: 'spotify',
    color: '#1ed760',
    isCollection: u => /\/(playlist|album)\//.test(u.pathname),
    embed: u => {
      const m = u.pathname.match(/\/(track|album|playlist)\/([A-Za-z0-9]+)/);
      if (!m) return null;
      return {
        src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
        height: m[1] === 'track' ? 152 : 352,
      };
    },
  },
  {
    id: 'apple-music',
    label: 'Apple Music',
    hosts: ['music.apple.com'],
    defaultFormat: 'mp3',
    audioOnly: true,
    catalog: 'apple',
    color: '#fa2d48',
    isCollection: u =>
      u.pathname.includes('/playlist/') ||
      (u.pathname.includes('/album/') && !u.searchParams.get('i')),
    embed: u => ({
      src: `https://embed.music.apple.com${u.pathname}${u.search}`,
      height:
        u.searchParams.get('i') || u.pathname.includes('/song/') ? 175 : 450,
    }),
  },
  {
    id: 'vimeo',
    label: 'Vimeo',
    hosts: ['vimeo.com'],
    defaultFormat: 'mp4',
    color: '#17d5ff',
    isCollection: u =>
      /^\/(showcase|album|channels)\//.test(u.pathname) &&
      !/\/\d+$/.test(u.pathname),
    embed: u => {
      const id = segments(u).find(s => /^\d+$/.test(s));
      return id ? { src: `https://player.vimeo.com/video/${id}` } : null;
    },
  },
  {
    id: 'reddit',
    label: 'Reddit',
    hosts: ['reddit.com', 'redd.it'],
    defaultFormat: 'mp4',
    color: '#ff4500',
  },
  {
    id: 'x',
    label: 'X',
    hosts: ['x.com', 'twitter.com'],
    defaultFormat: 'mp4',
    color: '#a3a3a3',
  },
  {
    id: 'twitch',
    label: 'Twitch',
    hosts: ['twitch.tv'],
    defaultFormat: 'mp4',
    color: '#9146ff',
    isCollection: () => false,
  },
  {
    id: 'bandcamp',
    label: 'Bandcamp',
    hosts: ['bandcamp.com'],
    defaultFormat: 'mp3',
    audioOnly: true,
    color: '#1da0c3',
    isCollection: u =>
      u.pathname.startsWith('/album/') ||
      segments(u).length === 0 ||
      u.pathname === '/music',
  },
  {
    id: 'mixcloud',
    label: 'Mixcloud',
    hosts: ['mixcloud.com'],
    defaultFormat: 'mp3',
    audioOnly: true,
    color: '#5000ff',
    isCollection: u => segments(u).length === 1,
    embed: u =>
      segments(u).length >= 2
        ? {
            src: `https://player-widget.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(u.pathname)}`,
            height: 120,
          }
        : null,
  },
  {
    id: 'archive',
    label: 'Internet Archive',
    hosts: ['archive.org'],
    defaultFormat: 'mp4',
    color: '#d4d4d4',
  },
  {
    id: 'dailymotion',
    label: 'Dailymotion',
    hosts: ['dailymotion.com', 'dai.ly'],
    defaultFormat: 'mp4',
    color: '#0d65ff',
    embed: u => {
      const id =
        u.hostname === 'dai.ly'
          ? segments(u)[0]
          : u.pathname.match(/\/video\/([a-zA-Z0-9]+)/)?.[1];
      return id
        ? { src: `https://www.dailymotion.com/embed/video/${id}` }
        : null;
    },
  },
  {
    id: 'bilibili',
    label: 'Bilibili',
    hosts: ['bilibili.com', 'b23.tv'],
    defaultFormat: 'mp4',
    color: '#00aeec',
  },
];

export const GENERIC: Service = {
  id: 'generic',
  label: 'Web',
  hosts: [],
  defaultFormat: 'mp4',
  color: '#8a8a8a',
};

const hostMatches = (hostname: string, host: string) =>
  hostname === host || hostname.endsWith(`.${host}`);

export function parseUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // A bare word like "hello" parses as https://hello/; require a dot.
    if (!u.hostname.includes('.')) return null;
    return u;
  } catch {
    return null;
  }
}

export function getService(id: ServiceId): Service {
  return SERVICES.find(s => s.id === id) ?? GENERIC;
}

export interface Detected {
  service: Service;
  url: URL;
  /** true/false when the service knows; null when only yt-dlp can tell. */
  collection: boolean | null;
}

export function detect(input: string): Detected | null {
  const url = parseUrl(input);
  if (!url) return null;
  const hostname = url.hostname.toLowerCase();
  const service =
    SERVICES.find(s => s.hosts.some(h => hostMatches(hostname, h))) ?? GENERIC;
  return {
    service,
    url,
    collection: service.isCollection ? service.isCollection(url) : null,
  };
}

/**
 * For a YouTube video opened from inside a playlist (watch?v=…&list=…),
 * the playlist's own URL; otherwise null.
 */
export function playlistOf(u: URL): string | null {
  const list = u.searchParams.get('list');
  if (!list || !youtubeId(u)) return null;
  if (!/(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname)) return null;
  const host =
    u.hostname === 'music.youtube.com'
      ? 'music.youtube.com'
      : 'www.youtube.com';
  return `https://${host}/playlist?list=${encodeURIComponent(list)}`;
}

export const formatsFor = (service: Service): Format[] =>
  service.audioOnly ? ['mp3', 'wav'] : ['mp4', 'mp3', 'wav'];

export const mediaOf = (format: Format): 'video' | 'audio' =>
  format === 'mp4' ? 'video' : 'audio';
