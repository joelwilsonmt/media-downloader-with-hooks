import type { Destination, Format, HookConfig } from '@shared/schemas';
import { readJson, writeJson } from './storage';

export interface Settings {
  tiktok: { clientKey: string; clientSecret: string; accessToken: string };
  slack: string[];
  webhooks: string[];
  /** Netscape cookies.txt; sent with each request, never stored on the server. */
  cookies: string;
}

const SETTINGS_KEY = 'settings.v2';
const LEGACY_KEY = 'hookConfig';

interface LegacyConfig {
  tiktok?: Partial<Settings['tiktok']>;
  slack?: { webhookUrl?: string }[] | { webhookUrl?: string };
  webhook?: { url?: string }[] | { url?: string };
  youtubeCookies?: string;
}

const asArray = <T>(v: T | T[] | undefined): T[] =>
  Array.isArray(v) ? v : v ? [v] : [];

export function loadSettings(): Settings {
  const saved = readJson<Settings>(SETTINGS_KEY);
  if (saved) return saved;
  // Carry settings over from the previous UI.
  const legacy = readJson<LegacyConfig>(LEGACY_KEY) ?? {};
  return {
    tiktok: {
      clientKey: legacy.tiktok?.clientKey ?? '',
      clientSecret: legacy.tiktok?.clientSecret ?? '',
      accessToken: legacy.tiktok?.accessToken ?? '',
    },
    slack: asArray(legacy.slack).flatMap(s =>
      s.webhookUrl ? [s.webhookUrl] : []
    ),
    webhooks: asArray(legacy.webhook).flatMap(w => (w.url ? [w.url] : [])),
    cookies: legacy.youtubeCookies ?? '',
  };
}

export function saveSettings(settings: Settings) {
  writeJson(SETTINGS_KEY, settings);
}

export function toHookConfig(s: Settings): HookConfig {
  return {
    tiktok: s.tiktok.accessToken ? s.tiktok : undefined,
    slack: s.slack.filter(Boolean).map(webhookUrl => ({ webhookUrl })),
    webhook: s.webhooks.filter(Boolean).map(url => ({ url })),
  };
}

export const hasHooks = (s: Settings) =>
  !!s.tiktok.accessToken || s.slack.some(Boolean) || s.webhooks.some(Boolean);

// Preferences remembered between visits --------------------------------------

export interface Prefs {
  destination: Destination;
  formatByService: Record<string, Format>;
  folderByMedia: { audio?: string; video?: string };
}

const PREFS_KEY = 'prefs.v1';

export function loadPrefs(): Prefs {
  return {
    destination: 'server',
    formatByService: {},
    folderByMedia: {},
    ...readJson<Partial<Prefs>>(PREFS_KEY),
  };
}

export function savePrefs(prefs: Prefs) {
  writeJson(PREFS_KEY, prefs);
}

// Cookie helpers ---------------------------------------------------------------

/** Domains worth keeping from a full browser export. */
const COOKIE_DOMAINS = [
  'youtube.com',
  'google.com',
  'instagram.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'tiktok.com',
  'vimeo.com',
  'reddit.com',
  'twitch.tv',
  'soundcloud.com',
  'bandcamp.com',
];
const NOISY = [
  'mail.google.com',
  'drive.google.com',
  'photos.google.com',
  'docs.google.com',
  'play.google.com',
];

const cookieDomain = (line: string) =>
  line
    .split('\t')[0]
    ?.replace(/^#HttpOnly_/, '')
    .replace(/^\./, '')
    .toLowerCase();

export function cookieLines(text: string) {
  return text
    .split('\n')
    .filter(
      l => l.trim() && (!l.startsWith('#') || l.startsWith('#HttpOnly_'))
    );
}

export function sanitizeCookies(text: string): string {
  const header = '# Netscape HTTP Cookie File';
  const kept = cookieLines(text).filter(line => {
    const domain = cookieDomain(line);
    if (!domain || NOISY.includes(domain)) return false;
    return COOKIE_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
  });
  return kept.length ? [header, ...kept].join('\n') + '\n' : '';
}

export function cookieSummary(text: string): string | null {
  const lines = cookieLines(text);
  if (lines.length === 0) return null;
  const domains = new Map<string, number>();
  for (const line of lines) {
    const domain = cookieDomain(line);
    const site =
      COOKIE_DOMAINS.find(d => domain === d || domain?.endsWith(`.${d}`)) ??
      'other';
    domains.set(site, (domains.get(site) ?? 0) + 1);
  }
  return [...domains.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${d} ${n}`)
    .join(' · ');
}
