import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

dotenv.config({ quiet: true });

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

// Env var -> Docker path -> local 'downloads' folder
export const BASE_DOWNLOAD_DIR =
  process.env.DOWNLOAD_DIR ||
  (process.env.IS_DOCKER
    ? '/app/downloads'
    : path.join(PROJECT_ROOT, 'downloads'));
export const VIDEO_DIR = path.join(BASE_DOWNLOAD_DIR, 'videos');
export const AUDIO_DIR = path.join(BASE_DOWNLOAD_DIR, 'audio');

/** Partial downloads, cookie files and device-only files. Kept out of the library. */
export const TEMP_ROOT = path.join(os.tmpdir(), 'media-downloader');

export const WEB_DIST = path.join(PROJECT_ROOT, 'dist', 'web');

export const PORT = Number.parseInt(process.env.PORT || '3000', 10);
export const MAX_CONCURRENT_JOBS = Math.max(
  1,
  Number(process.env.MAX_CONCURRENT_JOBS || 2)
);
/** How long a device-only file waits on the server for the browser to fetch it. */
export const DEVICE_FILE_TTL_MS =
  Number(process.env.DEVICE_FILE_TTL_MINUTES || 60) * 60_000;

// Prefer the local bin (from setup script), then global
const localYtDlp = path.join(PROJECT_ROOT, 'bin', 'yt-dlp');
export const YT_DLP_PATH = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
// The image ships Alpine's ffmpeg; locally the npm static builds stand in.
export const FFMPEG_PATH = process.env.IS_DOCKER
  ? 'ffmpeg'
  : ffmpegStatic || 'ffmpeg';
export const FFPROBE_PATH = process.env.IS_DOCKER
  ? 'ffprobe'
  : ffprobeStatic?.path || 'ffprobe';

/** PATH extended so yt-dlp finds ffmpeg/ffprobe. */
export function ytDlpEnv(): NodeJS.ProcessEnv {
  const extra = [path.dirname(FFMPEG_PATH), path.dirname(FFPROBE_PATH)].filter(
    d => d !== '.'
  );
  return {
    ...process.env,
    PATH: [...extra, process.env.PATH || ''].join(path.delimiter),
  };
}

export function ensureDirectories() {
  for (const dir of [BASE_DOWNLOAD_DIR, VIDEO_DIR, AUDIO_DIR]) {
    if (fs.existsSync(dir)) continue;
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[Init] Created directory: ${dir}`);
    } catch (err) {
      console.error(`[Init] Failed to create directory: ${dir}`, err);
      process.exit(1);
    }
  }
  // Leftovers from a previous run belong to jobs that no longer exist.
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
}
