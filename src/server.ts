import { execSync } from 'node:child_process';
import { buildApp } from './app';
import {
  ensureDirectories,
  FFMPEG_PATH,
  FFPROBE_PATH,
  PORT,
  YT_DLP_PATH,
} from './config';
import { HookManager } from './hooks/HookManager';
import { JobManager } from './jobs';

ensureDirectories();
const hookManager = new HookManager();
const server = await buildApp(new JobManager(hookManager));

try {
  await hookManager.init();
  await server.listen({ port: PORT, host: '0.0.0.0' });
  server.log.info(`yt-dlp: ${YT_DLP_PATH}`);
  try {
    server.log.info(
      `yt-dlp version: ${execSync(`"${YT_DLP_PATH}" --version`).toString().trim()}`
    );
  } catch {
    server.log.warn('Could not determine yt-dlp version');
  }
  server.log.info(`ffmpeg: ${FFMPEG_PATH}`);
  server.log.info(`ffprobe: ${FFPROBE_PATH}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
