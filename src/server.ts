import fastify, { FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { TiktokService } from './TiktokService';
import ffmpegStatic from 'ffmpeg-static';

dotenv.config();

// Set timeout to 20 minutes (1200000 ms) for long downloads/transcodes
const server = fastify({ 
  logger: true,
  connectionTimeout: 1200000,
  keepAliveTimeout: 1200000,
  bodyLimit: 1048576 * 50 // 50MB body limit (not strictly needed for URL, but good hygiene)
});
const tiktokService = new TiktokService();

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

// Resolve Binary Paths
const PROJECT_ROOT = process.cwd();
// Prioritize local bin (from setup script), then global
const localYtDlp = path.join(PROJECT_ROOT, 'bin', 'yt-dlp');
const YT_DLP_PATH = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
const FFMPEG_PATH = ffmpegStatic || 'ffmpeg';

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
  const timestamp = Date.now();
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
      url
    ];

    const startTimestamp = Date.now();
    const ytDlp = spawn(YT_DLP_PATH, args);

    let finalFilePath = '';
    const logs: string[] = [];
    const errorLogs: string[] = [];
    const MAX_LOGS = 100;

    const addLog = (queue: string[], message: string) => {
        queue.push(message);
        if (queue.length > MAX_LOGS) {
            queue.shift(); // Remove oldest
        }
    };

    ytDlp.stdout.on('data', (data: Buffer) => {
      const line = data.toString();
      console.log(`[yt-dlp] ${line.trim()}`);
      addLog(logs, line.trim());
    });

    ytDlp.stderr.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      console.error(`[yt-dlp] ${line}`);
      addLog(errorLogs, line);
    });

    ytDlp.on('close', async (code: number | null) => {
      if (code !== 0) {
        return resolve(reply.status(500).send({ 
          error: 'Download failed',
          details: errorLogs.join('\n') || logs.join('\n')
        }));
      }

      console.log('[Processor] Download complete. Searching for file...');
      
      // Search for the most recently modified file in the download directory
      try {
        const files = fs.readdirSync(DOWNLOAD_DIR);
        // Map files to stats
        const fileStats = files.map(file => {
            const filepath = path.join(DOWNLOAD_DIR, file);
            return { file, mtime: fs.statSync(filepath).mtimeMs };
        });
        
        // Filter for files modified/created after we started the process (minus small buffer)
        // Note: With transcoding, the file might be created later than start, which is fine.
        const recentFiles = fileStats.filter(f => f.mtime >= startTimestamp - 5000 && f.file.endsWith('.mp4'));
        
        // Sort by newest
        recentFiles.sort((a, b) => b.mtime - a.mtime);

        if (recentFiles.length === 0) {
           return resolve(reply.status(500).send({ 
             error: 'File not found after download',
             details: 'yt-dlp exited successfully but no new .mp4 file was found.'
           }));
        }

        const downloadedFile = recentFiles[0].file;
        const fullPath = path.join(DOWNLOAD_DIR, downloadedFile);
        console.log(`[Processor] File located: ${fullPath}`);

        // Trigger TikTok Upload (Async)
        tiktokService.uploadVideo(fullPath)
          .then(() => console.log('Background upload completed'))
          .catch((err: unknown) => console.error('Background upload failed', err));

        return resolve(reply.send({ 
          success: true, 
          message: 'Download completed, upload started in background', 
          file: downloadedFile 
        }));

      } catch (err) {
         console.error('[Processor] file scanning failed', err);
         return resolve(reply.status(500).send({ 
           error: 'File processing error',
           details: err instanceof Error ? err.message : String(err)
         }));
      }
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
