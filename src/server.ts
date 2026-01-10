import fastify, { FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { HookManager } from './hooks/HookManager';
import ffmpegStatic from 'ffmpeg-static';

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
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || (process.env.IS_DOCKER ? '/app/downloads' : path.join(process.cwd(), 'downloads'));

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  try {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    console.log(`[Init] Created download directory: ${DOWNLOAD_DIR}`);
  } catch (err) {
    console.error(`[Init] Failed to create download directory: ${DOWNLOAD_DIR}`, err);
    process.exit(1);
  }
}

// ... Binary Setup ...
// Resolve Binary Paths
const PROJECT_ROOT = process.cwd();
// Prioritize local bin (from setup script), then global
const localYtDlp = path.join(PROJECT_ROOT, 'bin', 'yt-dlp');
const YT_DLP_PATH = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
const FFMPEG_PATH = ffmpegStatic || 'ffmpeg';

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
}

// Process Route
server.post<{ Body: ProcessRequest }>('/api/process', async (request, reply) => {
  const { url } = request.body;

  if (!url) {
    return reply.status(400).send({ error: 'URL is required' });
  }

  // Use a timestamp to avoid filename collisions and simple mapping
  // Use a timestamp to avoid filename collisions and simple mapping
  // const timestamp = Date.now();
  // Using %(title)s allows human-readable filenames. 
  // We keep the timestamp prefix to identify the specific download request reliably, 
  // but we put it in a way that looks like part of the name or distinct.
  // User asked for "file to be named the title of the video".
  // To compromise between collision safety and user request, we will rely on unique folders or just risk it?
  // User said "titled the title of the youtube video". 
  // Let's try to remove timestamp prefix to satisfy user, but we need to find the file safely.
  // Actually, we can use the 'find' logic differently. 
  // OR we can make the filename `Title.mp4` but keep the timestamp check by modification time? No that's flaky.
  // Let's stick to `Title.mp4` but we need to know what the title IS to find it.
  // yt-dlp can print the filename. 
  
  // We'll trust yt-dlp to handle the output name based on template using title.
  // Note: If we use %(title)s.%(ext)s, spaces might exist.
  const outputTemplate = path.join(DOWNLOAD_DIR, '%(title)s.%(ext)s');

  return new Promise((resolve, _reject) => {
    // Spawn yt-dlp process
    console.log(`[Processor] Starting download for: ${url}`);
    console.log(`[Processor] Using binaries: yt-dlp='${YT_DLP_PATH}', ffmpeg='${FFMPEG_PATH}'`);

    // Arguments for yt-dlp:
    // - Optimize for TikTok: Cap at 1080p (4K is overkill and slow to transcode).
    // - Prefer H.264 (avc1) and AAC (mp4a) to avoid transcoding entirely -> FAST.
    // - Fallback to re-encoding if native H.264 isn't available.
    const args = [
      '--ffmpeg-location', FFMPEG_PATH, 
      // Format Priority:
      // 1. Best 1080p (or less) H.264 Video + AAC Audio (Merge = Instant Copy)
      // 2. Best 1080p (or less) Any Video + AAC Audio
      // 3. Best 1080p (or less) Any Video + Any Audio
      '-f', 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      
      // Merge into MP4 container
      '--merge-output-format', 'mp4',
      
      '-o', outputTemplate,
      '--no-playlist',
      
      // CRITICAL: Print the filename so we can parse it from stdout
      // NOTE: --print filename implies simulation, so we must explicitly disable simulation to download
      '--print', 'filename',
      '--no-simulate',
      
      url
    ];

    // Remove unused timestamp variable
    // const startTimestamp = Date.now();
    const ytDlp = spawn(YT_DLP_PATH, args);

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
        // 1. Ends with .mp4 (video file)
        // 2. Is an absolute path (yt-dlp --print filename with absolute output template returns absolute path)
        if (trimmed.endsWith('.mp4') && path.isAbsolute(trimmed)) {
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
      // Process any remaining buffer
      if (stdoutBuffer.trim()) {
          processLine(stdoutBuffer);
      }

      if (code !== 0) {
        return resolve(reply.status(500).send({ 
          error: 'Download failed',
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
      }).then(() => console.log('Hooks processing completed'))
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
    const port = parseInt(process.env.PORT || '3000');
    // Listen on all interfaces for Docker
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Server running on port ${port}`);
    server.log.info(`yt-dlp: ${YT_DLP_PATH}`);
    server.log.info(`ffmpeg: ${FFMPEG_PATH}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
