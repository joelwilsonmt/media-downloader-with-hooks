import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import fastifyStatic from '@fastify/static';
import fastify from 'fastify';
import { Zip, ZipPassThrough } from 'fflate';
import {
  InfoRequestSchema,
  JobRequestSchema,
  type MediaInfo,
  type ServerEvent,
} from '../shared/schemas';
import { detect } from '../shared/services';
import { resolveCatalog } from './catalog';
import { AUDIO_DIR, VIDEO_DIR, WEB_DIST } from './config';
import type { JobManager } from './jobs';
import { contentDisposition, safeSegment } from './paths';
import { runJson, withCookies, YtDlpError } from './ytdlp';

export async function buildApp(
  jobs: JobManager,
  { logger = true }: { logger?: boolean } = {}
) {
  const server = fastify({
    logger: logger ? { level: process.env.LOG_LEVEL || 'info' } : false,
    // Cookie exports can be large.
    bodyLimit: 5 * 1024 * 1024,
  });

  const badRequest = (issues: { message: string }[]) => ({
    error: issues[0]?.message ?? 'Invalid request',
  });

  // Info ------------------------------------------------------------------------

  interface YtInfo {
    _type?: string;
    title?: string;
    uploader?: string;
    channel?: string;
    playlist_count?: number;
    duration?: number;
    thumbnail?: string;
    thumbnails?: { url: string }[];
    age_limit?: number;
    entries?: { thumbnails?: { url: string }[] }[];
  }

  server.post('/api/info', async (request, reply) => {
    const parsed = InfoRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.status(400).send(badRequest(parsed.error.issues));
    const detected = detect(parsed.data.url);
    if (!detected)
      return reply.status(400).send({ error: 'That is not a link.' });

    const abort = new AbortController();
    // The request stream closes once its body is read; the response closing
    // before it finished is what means the browser gave up.
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) abort.abort();
    });

    try {
      if (detected.service.catalog) {
        const result = await resolveCatalog(
          detected.service.catalog,
          detected.url.href
        );
        const info: MediaInfo = {
          title: result.title,
          uploader: result.artist,
          thumbnail: result.thumbnail,
          collection: detected.collection
            ? { count: result.tracks.length }
            : undefined,
        };
        return info;
      }

      const data = await withCookies(parsed.data.cookies, cookieArgs =>
        runJson<YtInfo>(
          [
            ...cookieArgs,
            '--flat-playlist',
            '--dump-single-json',
            '--playlist-end',
            '1000',
            ...(detected.collection === false ? ['--no-playlist'] : []),
            detected.url.href,
          ],
          { signal: abort.signal }
        )
      );
      const isPlaylist = data._type === 'playlist';
      const info: MediaInfo = {
        title: data.title || detected.url.href,
        uploader: data.uploader || data.channel,
        duration: isPlaylist
          ? undefined
          : Math.floor(data.duration || 0) || undefined,
        thumbnail:
          data.thumbnail ||
          data.thumbnails?.at(-1)?.url ||
          data.entries?.[0]?.thumbnails?.at(-1)?.url,
        ageLimit: data.age_limit || 0,
        collection: isPlaylist
          ? { count: data.entries?.length ?? data.playlist_count ?? 0 }
          : undefined,
      };
      return info;
    } catch (err) {
      if (abort.signal.aborted)
        return reply.status(499).send({ error: 'Cancelled' });
      request.log.warn({ err }, 'info failed');
      return reply.status(422).send({
        error: err instanceof Error ? err.message : 'Could not read this link.',
        details:
          err instanceof YtDlpError ? err.details.slice(-4000) : undefined,
      });
    }
  });

  // Folders ---------------------------------------------------------------------

  server.get<{ Querystring: { media?: string } }>(
    '/api/folders',
    async request => {
      const root = request.query.media === 'video' ? VIDEO_DIR : AUDIO_DIR;
      try {
        return fs
          .readdirSync(root, { withFileTypes: true })
          .filter(d => d.isDirectory() && !d.name.startsWith('.'))
          .map(d => d.name)
          .sort((a, b) => a.localeCompare(b));
      } catch {
        return [];
      }
    }
  );

  // Jobs ------------------------------------------------------------------------

  server.get('/api/jobs', async () => jobs.list());

  server.post('/api/jobs', async (request, reply) => {
    const parsed = JobRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.status(400).send(badRequest(parsed.error.issues));
    try {
      return reply.status(201).send(jobs.create(parsed.data));
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : 'Invalid request',
      });
    }
  });

  server.post('/api/jobs/clear', async () => {
    jobs.clearFinished();
    return { ok: true };
  });

  server.post<{ Params: { id: string } }>(
    '/api/jobs/:id/cancel',
    async (request, reply) => {
      if (!jobs.get(request.params.id))
        return reply.status(404).send({ error: 'No such job' });
      jobs.cancel(request.params.id);
      return { ok: true };
    }
  );

  server.post<{ Params: { id: string } }>(
    '/api/jobs/:id/retry',
    async (request, reply) => {
      if (!jobs.get(request.params.id))
        return reply.status(404).send({ error: 'No such job' });
      jobs.retry(request.params.id);
      return { ok: true };
    }
  );

  server.delete<{ Params: { id: string } }>('/api/jobs/:id', async request => {
    jobs.remove(request.params.id);
    return { ok: true };
  });

  server.get<{ Params: { id: string } }>(
    '/api/jobs/:id/file',
    async (request, reply) => {
      const job = jobs.get(request.params.id);
      const files = jobs.files(request.params.id);
      if (!job || files.length === 0) {
        return reply
          .status(404)
          .send({ error: 'This file is no longer on the server.' });
      }

      if (job.kind === 'item') {
        const file = files[0]!;
        return reply
          .header('Content-Disposition', contentDisposition(file.name))
          .header('Content-Length', fs.statSync(file.path).size)
          .type('application/octet-stream')
          .send(fs.createReadStream(file.path));
      }

      // Collections stream as an uncompressed zip; media is already compressed.
      const out = new PassThrough();
      const zip = new Zip((err, chunk, final) => {
        if (err) return out.destroy(err);
        out.write(chunk);
        if (final) out.end();
      });
      void (async () => {
        const used = new Set<string>();
        for (const file of files) {
          let name = file.name;
          for (let n = 2; used.has(name); n++)
            name = file.name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
          used.add(name);
          const entry = new ZipPassThrough(name);
          zip.add(entry);
          for await (const chunk of fs.createReadStream(file.path)) {
            entry.push(chunk as Uint8Array);
            if (out.writableNeedDrain)
              await new Promise(r => out.once('drain', r));
            if (out.destroyed) return;
          }
          entry.push(new Uint8Array(0), true);
        }
        zip.end();
      })().catch(err => out.destroy(err));

      return reply
        .header(
          'Content-Disposition',
          contentDisposition(`${safeSegment(job.title) || 'playlist'}.zip`)
        )
        .type('application/zip')
        .send(out);
    }
  );

  // Live updates (Server-Sent Events) -------------------------------------------

  server.get('/api/events', (_request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: ServerEvent) =>
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: 'snapshot', jobs: jobs.list() });
    jobs.on('event', send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    res.on('close', () => {
      clearInterval(heartbeat);
      jobs.off('event', send);
    });
  });

  // UI --------------------------------------------------------------------------

  if (fs.existsSync(WEB_DIST)) {
    await server.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
    server.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/'))
        return reply.status(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  } else {
    server.get('/', (_request, reply) =>
      reply
        .type('text/plain')
        .send(
          'UI not built. Run `bun run build`, or `bun run dev` for development.'
        )
    );
  }

  return server;
}
