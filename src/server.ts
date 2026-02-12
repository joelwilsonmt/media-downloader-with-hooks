import fastify, { FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { HookManager } from './hooks/HookManager';
import { HookConfig } from './hooks/Hook';
import ffmpegStatic from 'ffmpeg-static';

// Robustly resolve ffprobe-static
let ffprobeStatic: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ffprobeStatic = require('ffprobe-static');
} catch (e) {
  // Fallback if require fails in some environments
}

dotenv.config();

// Set timeout to 20 minutes (1200000 ms) for long downloads/transcodes
const server = fastify({ 
  logger: true,
  connectionTimeout: 1200000,
  keepAliveTimeout: 1200000,
  bodyLimit: 1048576 * 50 // 50MB body limit (not strictly needed for URL, but good hygiene)
});
const hookManager = new HookManager();

// Determine download directory: Env var -> Docker path -> Local 'downloads' folder
const BASE_DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || (process.env.IS_DOCKER ? '/app/downloads' : path.join(process.cwd(), 'downloads'));
const VIDEO_DIR = path.join(BASE_DOWNLOAD_DIR, 'videos');
const AUDIO_DIR = path.join(BASE_DOWNLOAD_DIR, 'audio');

// Ensure directories exist
[BASE_DOWNLOAD_DIR, VIDEO_DIR, AUDIO_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[Init] Created directory: ${dir}`);
    } catch (err) {
      console.error(`[Init] Failed to create directory: ${dir}`, err);
      process.exit(1);
    }
  }
});

// ... Binary Setup ...
// Resolve Binary Paths
const PROJECT_ROOT = process.cwd();
// Prioritize local bin (from setup script), then global
const localYtDlp = path.join(PROJECT_ROOT, 'bin', 'yt-dlp');
const YT_DLP_PATH = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
const FFMPEG_PATH = ffmpegStatic || 'ffmpeg';
const FFPROBE_PATH = ffprobeStatic?.path || 'ffprobe';

// Helper to extend PATH for yt-dlp to find ffmpeg/ffprobe
const getExtendedEnv = () => {
  const env = { ...process.env };
  const ffmpegDir = path.dirname(FFMPEG_PATH);
  const ffprobeDir = path.dirname(FFPROBE_PATH);
  
  const additionalPaths = [];
  if (ffmpegDir !== '.') additionalPaths.push(ffmpegDir);
  if (ffprobeDir !== '.') additionalPaths.push(ffprobeDir);
  
  if (additionalPaths.length > 0) {
    env.PATH = `${additionalPaths.join(path.delimiter)}${path.delimiter}${process.env.PATH || ''}`;
  }
  return env;
};

// ... Server Routes ...



// Serve index.html
server.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
  const indexFile = path.join(__dirname, '../public/index.html');
  try {
    const buffer = fs.readFileSync(indexFile);
    reply.type('text/html').send(buffer);
  } catch {
    reply.status(404).send('Index file not found');
  }
});
interface ProcessRequest {
  url: string;
  audioOnly?: boolean;
  enableRange?: boolean;
  startTime?: number; // in seconds
  endTime?: number;   // in seconds
  hookConfig?: HookConfig;
  cookies?: string;
  subFolder?: string;
}

interface InfoRequest {
  url: string;
  cookies?: string;
}

// Info Route
server.post<{ Body: InfoRequest }>('/api/info', async (request, reply) => {
  const { url, cookies } = request.body;

  if (!url) {
    return reply.status(400).send({ error: 'URL is required' });
  }

  return new Promise((resolve) => {
    console.log(`[Info] Request for duration: ${url}`);
    const args = [
      '--no-playlist',
      '--dump-json',
      '--js-runtimes', 'node',
    ];

    let cookieFile = '';
    if (cookies && cookies.trim()) {
        const id = crypto.randomBytes(8).toString('hex');
        cookieFile = path.join(BASE_DOWNLOAD_DIR, `cookies_${id}.txt`);
        fs.writeFileSync(cookieFile, cookies);
        args.push('--cookies', cookieFile);
    }

    args.push(url);

    const ytDlp = spawn(YT_DLP_PATH, args, { env: getExtendedEnv() });

    let stdout = '';
    let stderr = '';

    ytDlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytDlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytDlp.on('close', (code) => {
      // Cleanup cookie file
      if (cookieFile && fs.existsSync(cookieFile)) {
          fs.unlinkSync(cookieFile);
      }

      if (code !== 0) {
        console.error(`[Info] yt-dlp failed with code ${code}: ${stderr}`);
        let userError = 'Failed to fetch video info';
        const lowerStderr = stderr.toLowerCase();
        if (lowerStderr.includes('cookies are no longer valid') || lowerStderr.includes('rotated in the browser')) {
          userError = 'YouTube cookies are invalid or rotated. Please use the "Clean Export Guide" in Settings.';
        } else if (lowerStderr.includes('sign in to confirm your age')) {
          userError = 'This video is age-restricted. Please provide valid cookies in Settings.';
        }
        return resolve(reply.status(500).send({ error: userError, details: stderr }));
      }

      try {
        const data = JSON.parse(stdout);
        const duration = Math.floor(data.duration || 0);
        const thumbnail = data.thumbnail || '';
        const ageLimit = data.age_limit || 0;

        console.log(`[Info] Info detected - Duration: ${duration}s, Thumbnail: ${!!thumbnail}, AgeLimit: ${ageLimit}`);
        return resolve(reply.send({ duration, thumbnail, ageLimit }));
      } catch (err) {
        console.error(`[Info] Failed to parse JSON from stdout: "${stdout}"`, err);
        return resolve(reply.status(500).send({ error: 'Failed to parse video info' }));
      }
    });
  });
});

// List Sub-folders Route
server.get<{ Querystring: { type: 'audio' | 'video' } }>('/api/sub-folders', async (request, reply) => {
  const { type } = request.query;
  const targetParent = type === 'audio' ? AUDIO_DIR : VIDEO_DIR;

  try {
    if (!fs.existsSync(targetParent)) {
      console.log(`[Subfolders] Parent not found: ${targetParent}`);
      return reply.send([]);
    }
    
    const items = fs.readdirSync(targetParent, { withFileTypes: true });
    const subdirs = items
      .filter(item => item.isDirectory())
      .map(item => item.name);
    
    console.log(`[Subfolders] Listed for ${type}: ${subdirs.join(', ')}`);
    return reply.send(subdirs);
  } catch (err) {
    console.error(`[Subfolders] Failed to list: ${err}`);
    return reply.status(500).send({ error: 'Failed to list sub-folders' });
  }
});

// Process Route
server.post<{ Body: ProcessRequest }>('/api/process', async (request, reply) => {
  const { url, audioOnly, enableRange, startTime, endTime, hookConfig, cookies, subFolder } = request.body;

  if (!url) {
    return reply.status(400).send({ error: 'URL is required' });
  }

    const isSoundCloud = url.toLowerCase().includes('soundcloud.com');
    const effectiveAudioOnly = audioOnly || isSoundCloud;
    let targetDir = effectiveAudioOnly ? AUDIO_DIR : VIDEO_DIR;

    if (subFolder && subFolder.trim()) {
        targetDir = path.join(targetDir, subFolder.trim());
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log(`[Processor] Created sub-folder: ${targetDir}`);
        }
    }

    // Base template for filenames.
    // When extracting audio, yt-dlp might change extension to .mp3 even if template says .mp4 or .%(ext)s
    let filenameTemplate = '%(title)s.%(ext)s';

    function formatTimeFriendly(seconds: number): string {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return `${h}h${m}m${s}s`;
      if (m > 0) return `${m}m${s}s`;
      return `${s}s`;
    }

    function formatTimeHHMMSS(seconds: number): string {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    if (enableRange && startTime != null && endTime != null) {
        filenameTemplate = `%(title)s (${formatTimeFriendly(startTime)}-${formatTimeFriendly(endTime)}).%(ext)s`;
    }
    const outputTemplate = path.join(targetDir, filenameTemplate);

    return new Promise((resolve, _reject) => {
      // Spawn yt-dlp process
      console.log(`[Processor] Request for: ${url} (AudioOnly: ${!!effectiveAudioOnly}, Range: ${!!enableRange}, SoundCloud: ${isSoundCloud})`);
      console.log(`[Processor] Using binaries: yt-dlp='${YT_DLP_PATH}', ffmpeg='${FFMPEG_PATH}', ffprobe='${FFPROBE_PATH}'`);

    const args = [
      '--no-playlist',
      '--print', 'after_move:filepath',
      '--no-simulate',
      '--js-runtimes', 'node',
      '-o', outputTemplate,
    ];

    let cookieFile = '';
    if (cookies && cookies.trim()) {
        const id = crypto.randomBytes(8).toString('hex');
        cookieFile = path.join(BASE_DOWNLOAD_DIR, `cookies_${id}.txt`);
        fs.writeFileSync(cookieFile, cookies);
        args.push('--cookies', cookieFile);
    }

    if (effectiveAudioOnly) {
        if (isSoundCloud) {
            // Extract highest quality wav for SoundCloud
            args.push('-x', '--audio-format', 'wav');
        } else {
            // Extract highest quality mp3 for others
            args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
        }
    } else {
        // Video optimization
        args.push('-f', 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best');
        args.push('--merge-output-format', 'mp4');
    }

    if (enableRange && startTime != null && endTime != null) {
        // yt-dlp --download-sections "*00:00:10-00:00:20"
        const rangeStr = `*${formatTimeHHMMSS(startTime)}-${formatTimeHHMMSS(endTime)}`;
        args.push('--download-sections', rangeStr);
        // Note: download-sections requires ffmpeg and might be slower as it seeks, 
        // but it's more bandwidth efficient than downloading all and cutting.
    }

    args.push(url);

    const ytDlp = spawn(YT_DLP_PATH, args, { env: getExtendedEnv() });

    let finalFilePath = ''; // Will be captured from stdout
    const logs: string[] = [];
    const errorLogs: string[] = [];
    const MAX_LOGS = 100;

    const addLog = (queue: string[], message: string) => {
        queue.push(message);
        if (queue.length > MAX_LOGS) {
            queue.shift(); // Remove oldest
        }
    };

    let stdoutBuffer = '';

    const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Log everything from yt-dlp to console
        console.log(`[yt-dlp] ${trimmed}`);
        addLog(logs, trimmed);

        // Robust check:
        // Capture any absolute path ending with .mp4, .mp3, or .wav
        // (yt-dlp --print after_move:filepath will output this)
        if ((trimmed.endsWith('.mp4') || trimmed.endsWith('.mp3') || trimmed.endsWith('.wav')) && path.isAbsolute(trimmed)) {
            finalFilePath = trimmed;
        }
    };

    ytDlp.stdout.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      
      // The last element is either an empty string (if data ended with \n) 
      // or a partial line. We keep it in the buffer.
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        processLine(line);
      }
    });

    ytDlp.stderr.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
          if (line.trim()) {
            console.error(`[yt-dlp] ${line.trim()}`);
            addLog(errorLogs, line.trim());
          }
      }
    });

    ytDlp.on('close', async (code: number | null) => {
      // Cleanup cookie file
      if (cookieFile && fs.existsSync(cookieFile)) {
          fs.unlinkSync(cookieFile);
      }

      // Process any remaining buffer
      if (stdoutBuffer.trim()) {
          const remainingLines = stdoutBuffer.split('\n');
          for (const line of remainingLines) {
              processLine(line);
          }
      }

      if (code !== 0) {
        let userError = 'Download failed';
        const combinedLogs = (errorLogs.join('\n') + logs.join('\n')).toLowerCase();
        
        if (combinedLogs.includes('cookies are no longer valid') || combinedLogs.includes('rotated in the browser')) {
          userError = 'YouTube cookies are invalid or rotated. Please use the "Clean Export Guide" in Settings.';
        } else if (combinedLogs.includes('sign in to confirm your age')) {
          userError = 'This video is age-restricted. Please provide valid cookies in Settings.';
        }

        return resolve(reply.status(500).send({ 
          error: userError,
          details: errorLogs.join('\n') || logs.join('\n')
        }));
      }

      if (!finalFilePath || !fs.existsSync(finalFilePath)) {
          // If we failed to capture filename from stdout, try to backup guess?
          // Or just fail. Let's try to fail for now to be strict.
          // Actually, let's try to construct it if we can?
          // No, trusting stdout is better.
          
           console.error('[Processor] Could not detect output filename from yt-dlp stdout.');
           return resolve(reply.status(500).send({ 
             error: 'Download failed - file not detected',
             details: 'yt-dlp exited successfully but the output filename could not be determined.'
           }));
      }

      console.log(`[Processor] File located: ${finalFilePath}`);

      // Trigger Hooks (Async)
      const downloadedFile = path.basename(finalFilePath);
      const videoTitle = path.basename(downloadedFile, path.extname(downloadedFile));
      
      hookManager.notify({
          filePath: finalFilePath,
          fileName: downloadedFile,
          videoTitle: videoTitle,
          sourceUrl: url
      }, hookConfig).then(() => console.log('Hooks processing completed'))
        .catch(err => console.error('Hooks processing had errors', err));

      return resolve(reply.send({ 
        success: true, 
        message: 'Download completed, processing hooks in background', 
        file: downloadedFile 
      }));
    });
  });
});

const start = async () => {
  try {
    // Initialize hooks
    await hookManager.init();

    const port = parseInt(process.env.PORT || '3000');
    // Listen on all interfaces for Docker
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Server running on port ${port}`);
    server.log.info(`yt-dlp: ${YT_DLP_PATH}`);
    
    // Log version info for debugging
    try {
        const version = execSync(`"${YT_DLP_PATH}" --version`).toString().trim();
        server.log.info(`yt-dlp version: ${version}`);
    } catch (e) {
        server.log.warn('Could not determine yt-dlp version');
    }

    server.log.info(`ffmpeg: ${FFMPEG_PATH}`);
    server.log.info(`ffprobe: ${FFPROBE_PATH}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
