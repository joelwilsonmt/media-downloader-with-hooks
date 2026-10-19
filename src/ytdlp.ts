import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Format, JobProgress } from '../shared/schemas';
import { TEMP_ROOT, YT_DLP_PATH, ytDlpEnv } from './config';

export class YtDlpError extends Error {
  constructor(
    message: string,
    readonly details: string
  ) {
    super(message);
  }
}

/** Turns yt-dlp stderr into one sentence a person can act on. */
export function friendlyError(output: string, fallback: string): string {
  const text = output.toLowerCase();
  if (
    text.includes('cookies are no longer valid') ||
    text.includes('rotated in the browser')
  )
    return 'Your YouTube cookies have expired or rotated. Export fresh ones using the guide in Settings.';
  if (text.includes('sign in to confirm your age'))
    return 'This video is age-restricted. Add your YouTube cookies in Settings, then retry.';
  if (
    text.includes("sign in to confirm you're not a bot") ||
    text.includes('sign in to confirm you’re not a bot')
  )
    return 'YouTube wants a signed-in session. Add your YouTube cookies in Settings, then retry.';
  if (
    text.includes('private video') ||
    text.includes('only works when logged-in') ||
    text.includes('account credentials') ||
    text.includes('login required') ||
    text.includes('requires authentication')
  )
    return 'This item needs a signed-in session. Add cookies for the site in Settings, then retry.';
  if (text.includes('unsupported url'))
    return "yt-dlp doesn't recognise this link. Check that it points at a video or track page.";
  if (text.includes('http error 404') || text.includes('does not exist'))
    return 'Nothing found at this link. It may have been deleted or made private.';
  if (
    text.includes('http error 429') ||
    text.includes('rate-limit') ||
    text.includes('rate limit')
  )
    return 'The site is rate-limiting this server. Wait a few minutes, then retry.';
  if (text.includes('no space left on device'))
    return 'The server disk is full.';
  if (text.includes('drm protected'))
    return 'Every match for this track is DRM-locked (SoundCloud Go+).';
  if (text.includes('http error 403'))
    return 'The site refused the download (HTTP 403). This usually means yt-dlp needs an update; rebuilding the image pulls the latest.';
  if (text.includes('impersonat'))
    return 'This site needs browser impersonation, which this yt-dlp install lacks. The Docker image includes it.';
  return fallback;
}

/** Writes cookies to a private temp file for the duration of fn. */
export async function withCookies<T>(
  cookies: string | undefined,
  fn: (args: string[]) => Promise<T>
): Promise<T> {
  if (!cookies?.trim()) return fn([]);
  const file = path.join(
    TEMP_ROOT,
    `cookies_${crypto.randomBytes(8).toString('hex')}.txt`
  );
  fs.writeFileSync(file, cookies, { mode: 0o600 });
  try {
    return await fn(['--cookies', file]);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** Runs yt-dlp and parses its JSON stdout. Aborting kills the process. */
export function runJson<T = unknown>(
  args: string[],
  {
    signal,
    timeoutMs = 90_000,
  }: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(YT_DLP_PATH, ['--js-runtimes', 'node', ...args], {
      env: ytDlpEnv(),
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('error', err =>
      reject(new YtDlpError('Could not start yt-dlp', String(err)))
    );
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (code !== 0) {
        return reject(
          new YtDlpError(
            friendlyError(stderr, 'Could not read this link.'),
            stderr.trim()
          )
        );
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch {
        reject(
          new YtDlpError(
            'yt-dlp returned unreadable info.',
            stdout.slice(0, 2000)
          )
        );
      }
    });
  });
}

export const FORMAT_ARGS: Record<Format, string[]> = {
  mp4: [
    '--embed-thumbnail',
    '-f',
    'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
    '--merge-output-format',
    'mp4',
    // Single-file sources (webm, mkv) land as mp4 too.
    '--remux-video',
    'mp4',
  ],
  mp3: [
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    '--embed-thumbnail',
  ],
  // WAV has no cover-art container.
  wav: ['-x', '--audio-format', 'wav'],
};

const hhmmss = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(n => String(n).padStart(2, '0'))
    .join(':');

export const friendlyDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${m}m${sec}s`;
  if (m > 0) return `${m}m${sec}s`;
  return `${sec}s`;
};

export interface DownloadOptions {
  url: string;
  format: Format;
  outputDir: string;
  tempDir: string;
  /** Literal file name without extension; defaults to the media title. */
  name?: string;
  trim?: { start: number; end: number };
}

export function downloadArgs(o: DownloadOptions): string[] {
  let base = o.name ? o.name : '%(title).180B';
  if (o.trim)
    base += ` (${friendlyDuration(o.trim.start)}-${friendlyDuration(o.trim.end)})`;
  const args = [
    '--no-playlist',
    '--newline',
    '--progress',
    '--no-simulate',
    '--print',
    'after_move:FILE:%(filepath)s',
    '--progress-template',
    'download:PROGRESS %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s',
    '--progress-template',
    'postprocess:STAGE %(progress.postprocessor)s %(progress.status)s',
    '--add-metadata',
    '-P',
    o.outputDir,
    '-P',
    `temp:${o.tempDir}`,
    '-o',
    `${base}.%(ext)s`,
    ...FORMAT_ARGS[o.format],
  ];
  if (o.trim)
    args.push(
      '--download-sections',
      `*${hhmmss(o.trim.start)}-${hhmmss(o.trim.end)}`
    );
  // Searches try each result until one downloads (some are DRM-locked).
  if (isSearch(o.url)) args.push('--max-downloads', '1', '--ignore-errors');
  args.push(o.url);
  return args;
}

export const isSearch = (url: string) => /^[a-z]+search\d*:/.test(url);

/** yt-dlp exits 101 when --max-downloads stops it, which is success for a search. */
export const succeeded = (code: number | null, url: string) =>
  code === 0 || (code === 101 && isSearch(url));

const STAGE_LABELS: Record<string, string> = {
  ExtractAudio: 'Converting audio',
  Merger: 'Merging video and audio',
  VideoRemuxer: 'Remuxing to MP4',
  EmbedThumbnail: 'Embedding cover art',
  Metadata: 'Writing tags',
  FFmpegMetadata: 'Writing tags',
};

export type OutputLine =
  | { type: 'progress'; progress: JobProgress }
  | { type: 'stage'; stage: string }
  | { type: 'file'; path: string }
  | { type: 'log'; line: string };

const num = (s: string | undefined) => {
  if (!s || s === 'NA' || s === 'None') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export function parseLine(raw: string): OutputLine | null {
  const line = raw.trim();
  if (!line) return null;
  if (line.startsWith('FILE:')) return { type: 'file', path: line.slice(5) };
  if (line.startsWith('PROGRESS ')) {
    const [, done, total, estimate, speed, eta] = line.split(' ');
    const downloadedBytes = num(done);
    const totalBytes = num(total) ?? num(estimate);
    return {
      type: 'progress',
      progress: {
        downloadedBytes,
        totalBytes,
        speed: num(speed),
        eta: num(eta),
        percent:
          downloadedBytes != null && totalBytes
            ? Math.min(100, (downloadedBytes / totalBytes) * 100)
            : undefined,
      },
    };
  }
  if (line.startsWith('STAGE ')) {
    const [, name, status] = line.split(' ');
    if (status !== 'started' || !name || name === 'MoveFiles') return null;
    return { type: 'stage', stage: STAGE_LABELS[name] ?? 'Processing' };
  }
  return { type: 'log', line };
}

/** Pulls usable fields out of a flat --dump-single-json result. */
export interface FlatEntry {
  url: string;
  title: string;
}

interface RawEntry {
  id?: string;
  url?: string;
  webpage_url?: string;
  title?: string;
  uploader_id?: string;
  ie_key?: string;
}

export function entryUrl(e: RawEntry, collectionUrl: string): string | null {
  const direct = e.webpage_url || e.url;
  if (direct && /^https?:\/\//.test(direct)) return direct;
  if (!e.id) return null;
  if (collectionUrl.includes('soundcloud.com'))
    return `https://soundcloud.com/${e.uploader_id || ''}/${e.id}`;
  if (e.ie_key === 'Youtube' || /youtu/.test(collectionUrl))
    return `https://www.youtube.com/watch?v=${e.id}`;
  return direct ?? null;
}

export function flatEntries(
  entries: RawEntry[] | undefined,
  collectionUrl: string
): FlatEntry[] {
  return (entries ?? []).flatMap(e => {
    const url = entryUrl(e, collectionUrl);
    return url ? [{ url, title: e.title || e.id || url }] : [];
  });
}
