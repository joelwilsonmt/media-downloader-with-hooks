import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {
  FINISHED,
  type Job,
  type JobRequest,
  type ServerEvent,
} from '../shared/schemas';
import { detect, mediaOf, type Detected } from '../shared/services';
import { resolveCatalog, searchQuery, trackLabel } from './catalog';
import {
  AUDIO_DIR,
  DEVICE_FILE_TTL_MS,
  MAX_CONCURRENT_JOBS,
  TEMP_ROOT,
  VIDEO_DIR,
  YT_DLP_PATH,
  ytDlpEnv,
} from './config';
import type { HookManager } from './hooks/HookManager';
import {
  folderSegments,
  literalTemplate,
  resolveUnder,
  safeSegment,
} from './paths';
import {
  downloadArgs,
  flatEntries,
  friendlyError,
  parseLine,
  runJson,
  succeeded,
  withCookies,
  YtDlpError,
} from './ytdlp';

const HISTORY_LIMIT = 300;
const EMIT_INTERVAL_MS = 300;
const ACTIVE = new Set(['queued', 'downloading', 'processing']);

interface Entry {
  job: Job;
  request: JobRequest;
  /** Raw folder input; validated when the download starts. */
  folder: string;
  children: string[];
  resolved: boolean;
  process?: ChildProcess;
  filePath?: string;
  tempDir: string;
  lastEmit: number;
  pendingEmit?: ReturnType<typeof setTimeout>;
  expiry?: ReturnType<typeof setTimeout>;
}

const mediaRoot = (format: Job['format']) =>
  mediaOf(format) === 'audio' ? AUDIO_DIR : VIDEO_DIR;
const rootName = (format: Job['format']) =>
  mediaOf(format) === 'audio' ? 'audio' : 'videos';
const displayFolder = (format: Job['format'], folder: string) =>
  [rootName(format), ...folderSegments(folder)].join('/');

interface FlatPlaylist {
  _type?: string;
  title?: string;
  entries?: { id?: string; url?: string; title?: string }[];
}

export class JobManager extends EventEmitter<{ event: [ServerEvent] }> {
  private entries = new Map<string, Entry>();
  private queue: string[] = [];
  private running = 0;

  constructor(private hooks: HookManager) {
    super();
  }

  list(): Job[] {
    return [...this.entries.values()].map(e => e.job);
  }

  get(id: string): Job | undefined {
    return this.entries.get(id)?.job;
  }

  create(request: JobRequest): Job {
    const detected = detect(request.url);
    if (!detected) throw new Error('That is not a link.');
    const entry = this.add({
      request,
      folder: request.folder ?? '',
      job: {
        kind: 'item',
        url: detected.url.href,
        service: detected.service.id,
        title: request.label || detected.url.href,
        status: 'resolving',
      },
    });
    void this.resolve(entry, detected);
    this.prune();
    return entry.job;
  }

  cancel(id: string) {
    const entry = this.entries.get(id);
    if (!entry || FINISHED.includes(entry.job.status)) return;
    if (entry.job.kind === 'collection') {
      for (const childId of entry.children) this.cancel(childId);
      this.patch(entry, {
        status: 'cancelled',
        finishedAt: Date.now(),
        progress: undefined,
      });
      return;
    }
    const proc = entry.process;
    this.patch(entry, {
      status: 'cancelled',
      finishedAt: Date.now(),
      progress: undefined,
      stage: undefined,
    });
    this.queue = this.queue.filter(q => q !== id);
    // yt-dlp spawns ffmpeg; kill the whole process group. Cleanup runs in the close handler.
    if (proc?.pid) {
      try {
        process.kill(-proc.pid, 'SIGTERM');
      } catch {
        proc.kill('SIGTERM');
      }
    }
    this.updateParent(entry);
  }

  retry(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    // A finished collection can retry the items that failed.
    if (
      entry.job.kind === 'collection' &&
      entry.resolved &&
      FINISHED.includes(entry.job.status)
    ) {
      entry.job.status = 'downloading';
      for (const childId of entry.children) this.retry(childId);
      this.refreshCollection(entry);
      return;
    }
    if (!['failed', 'cancelled'].includes(entry.job.status)) return;
    if (entry.job.kind === 'collection') {
      if (!entry.resolved) return this.reresolve(entry);
      entry.job.status = 'downloading';
      for (const childId of entry.children) this.retry(childId);
      this.refreshCollection(entry);
      return;
    }
    if (!entry.resolved) return this.reresolve(entry);
    this.patch(entry, {
      status: 'queued',
      error: undefined,
      details: undefined,
      finishedAt: undefined,
      progress: undefined,
      stage: undefined,
    });
    if (entry.job.parentId) {
      const parent = this.entries.get(entry.job.parentId);
      if (parent && FINISHED.includes(parent.job.status))
        parent.job.status = 'downloading';
    }
    this.enqueue(entry);
    this.updateParent(entry);
  }

  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (!FINISHED.includes(entry.job.status)) this.cancel(id);
    const ids = [id, ...entry.children];
    for (const removeId of ids) {
      const e = this.entries.get(removeId);
      if (!e) continue;
      clearTimeout(e.expiry);
      clearTimeout(e.pendingEmit);
      fs.rm(e.tempDir, { recursive: true, force: true }, () => {});
      this.entries.delete(removeId);
    }
    this.emit('event', { type: 'remove', ids });
  }

  clearFinished() {
    for (const e of [...this.entries.values()]) {
      if (!e.job.parentId && FINISHED.includes(e.job.status))
        this.remove(e.job.id);
    }
  }

  /** Files ready to send to the browser: one for an item, all finished children for a collection. */
  files(id: string): { path: string; name: string }[] {
    const entry = this.entries.get(id);
    if (!entry || !entry.job.downloadable) return [];
    const ids = entry.job.kind === 'collection' ? entry.children : [id];
    return ids.flatMap(childId => {
      const p = this.entries.get(childId)?.filePath;
      return p && fs.existsSync(p) ? [{ path: p, name: path.basename(p) }] : [];
    });
  }

  // ---------------------------------------------------------------------------

  private add(init: {
    request: JobRequest;
    folder: string;
    job: Pick<Job, 'kind' | 'url' | 'service' | 'title' | 'status'> & {
      parentId?: string;
    };
  }): Entry {
    const id = crypto.randomUUID();
    const entry: Entry = {
      request: init.request,
      folder: init.folder,
      children: [],
      resolved: false,
      tempDir: path.join(TEMP_ROOT, 'jobs', id),
      lastEmit: 0,
      job: {
        ...init.job,
        id,
        format: init.request.format,
        destination: init.request.destination,
        folder: displayFolder(init.request.format, init.folder),
        createdAt: Date.now(),
        downloadable: false,
      },
    };
    this.entries.set(id, entry);
    this.emitNow(entry);
    return entry;
  }

  private async resolve(entry: Entry, detected: Detected) {
    const { request } = entry;
    try {
      if (detected.service.catalog) {
        const result = await resolveCatalog(
          detected.service.catalog,
          detected.url.href
        );
        if (result.tracks.length === 0)
          throw new Error('No tracks found at this link.');
        if (detected.collection) {
          this.expand(
            entry,
            result.title,
            result.tracks.map(t => ({
              url: searchQuery(t),
              title: trackLabel(t),
              rename: trackLabel(t),
            }))
          );
        } else {
          const track = result.tracks[0]!;
          entry.request = {
            ...request,
            url: searchQuery(track),
            rename: request.rename || trackLabel(track),
          };
          this.patch(entry, { title: request.rename || trackLabel(track) });
          entry.resolved = true;
          this.enqueue(entry);
        }
        return;
      }

      if (detected.collection === false) {
        entry.resolved = true;
        this.enqueue(entry);
        return;
      }

      // Collection, or a site where only yt-dlp knows.
      const data = await withCookies(request.cookies, cookieArgs =>
        runJson<FlatPlaylist>([
          ...cookieArgs,
          '--flat-playlist',
          '--dump-single-json',
          '--playlist-end',
          '1000',
          detected.url.href,
        ])
      );
      if (data._type === 'playlist') {
        const items = flatEntries(data.entries, detected.url.href);
        if (items.length === 0)
          throw new Error('This playlist is empty or private.');
        this.expand(entry, data.title || 'Playlist', items);
      } else {
        if (data.title && !request.label)
          this.patch(entry, { title: data.title });
        entry.resolved = true;
        this.enqueue(entry);
      }
    } catch (err) {
      if (entry.job.status === 'cancelled') return;
      console.error(`[Jobs] Resolve failed for ${request.url}`, err);
      this.patch(entry, {
        status: 'failed',
        finishedAt: Date.now(),
        error: err instanceof Error ? err.message : 'Could not read this link.',
        details:
          err instanceof YtDlpError ? err.details.slice(-4000) : undefined,
      });
    }
  }

  private reresolve(entry: Entry) {
    const detected = detect(entry.request.url);
    if (!detected) return;
    this.patch(entry, {
      status: 'resolving',
      error: undefined,
      details: undefined,
      finishedAt: undefined,
    });
    void this.resolve(entry, detected);
  }

  private expand(
    entry: Entry,
    title: string,
    items: { url: string; title: string; rename?: string }[]
  ) {
    if (entry.job.status === 'cancelled') return;
    // A playlist lands in its own folder unless the user picked one.
    entry.folder =
      entry.request.folder?.trim() || safeSegment(title) || 'Playlist';
    entry.resolved = true;
    this.patch(entry, {
      kind: 'collection',
      title,
      status: 'downloading',
      folder: displayFolder(entry.job.format, entry.folder),
      counts: { total: items.length, done: 0, failed: 0 },
    });
    for (const item of items) {
      const child = this.add({
        request: {
          ...entry.request,
          url: item.url,
          rename: item.rename,
          trim: undefined,
          label: item.title,
        },
        folder: entry.folder,
        job: {
          kind: 'item',
          parentId: entry.job.id,
          url: item.url,
          service: entry.job.service,
          title: item.title,
          status: 'queued',
        },
      });
      child.resolved = true;
      entry.children.push(child.job.id);
      this.queue.push(child.job.id);
    }
    this.refreshCollection(entry);
    this.pump();
  }

  private enqueue(entry: Entry) {
    if (entry.job.status === 'cancelled') return;
    if (entry.job.status !== 'queued') this.patch(entry, { status: 'queued' });
    this.queue.push(entry.job.id);
    this.pump();
  }

  private pump() {
    while (this.running < MAX_CONCURRENT_JOBS && this.queue.length > 0) {
      const entry = this.entries.get(this.queue.shift()!);
      if (entry?.job.status === 'queued') void this.run(entry);
    }
  }

  private async run(entry: Entry) {
    this.running++;
    const { job, request } = entry;
    const workDir = path.join(entry.tempDir, 'work');
    let outputDir: string;
    try {
      outputDir =
        job.destination === 'device'
          ? path.join(entry.tempDir, 'out')
          : resolveUnder(mediaRoot(job.format), entry.folder);
      fs.mkdirSync(workDir, { recursive: true });
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (err) {
      this.running--;
      this.finishFailed(
        entry,
        err instanceof Error ? err.message : 'Could not create the folder.',
        ''
      );
      this.pump();
      return;
    }

    this.patch(entry, {
      status: 'downloading',
      stage: 'Starting',
      progress: undefined,
    });
    const stderr: string[] = [];

    const code = await withCookies(request.cookies, cookieArgs => {
      const args = [
        '--js-runtimes',
        'node',
        ...cookieArgs,
        ...downloadArgs({
          url: request.url,
          format: job.format,
          outputDir,
          tempDir: workDir,
          name: request.rename?.trim()
            ? literalTemplate(request.rename)
            : undefined,
          trim: request.trim,
        }),
      ];
      console.log(`[Jobs] ${job.id} yt-dlp ${request.url}`);
      return new Promise<number | null>(resolve => {
        const child = spawn(YT_DLP_PATH, args, {
          env: ytDlpEnv(),
          detached: true,
        });
        entry.process = child;
        let buffer = '';
        const handle = (raw: string) => {
          const line = parseLine(raw);
          if (!line || entry.job.status === 'cancelled') return;
          if (line.type === 'file') entry.filePath = line.path;
          else if (line.type === 'progress') {
            this.patch(
              entry,
              {
                status: 'downloading',
                stage: undefined,
                progress: line.progress,
              },
              true
            );
            this.updateParent(entry);
          } else if (line.type === 'stage')
            this.patch(entry, { status: 'processing', stage: line.stage });
        };
        child.stdout.on('data', (d: Buffer) => {
          buffer += d.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          lines.forEach(handle);
        });
        child.stderr.on('data', (d: Buffer) => {
          for (const l of d.toString().split('\n')) {
            if (!l.trim()) continue;
            stderr.push(l.trim());
            if (stderr.length > 100) stderr.shift();
          }
        });
        child.on('error', err => {
          stderr.push(String(err));
          resolve(-1);
        });
        child.on('close', c => {
          if (buffer) handle(buffer);
          resolve(c);
        });
      });
    });

    entry.process = undefined;
    this.running--;
    fs.rmSync(workDir, { recursive: true, force: true });

    if (entry.job.status === 'cancelled') {
      fs.rmSync(entry.tempDir, { recursive: true, force: true });
    } else if (
      succeeded(code, request.url) &&
      entry.filePath &&
      fs.existsSync(entry.filePath)
    ) {
      this.finishDone(entry);
    } else {
      const details = stderr.join('\n');
      this.finishFailed(
        entry,
        succeeded(code, request.url)
          ? 'yt-dlp finished but no file was produced.'
          : friendlyError(details, 'Download failed.'),
        details
      );
    }
    this.pump();
  }

  private finishDone(entry: Entry) {
    const filePath = entry.filePath!;
    const fileName = path.basename(filePath);
    const title = path.basename(fileName, path.extname(fileName));
    this.patch(entry, {
      status: 'done',
      stage: undefined,
      progress: undefined,
      finishedAt: Date.now(),
      title,
      fileName,
      sizeBytes: fs.statSync(filePath).size,
      downloadable: entry.job.destination !== 'server',
    });
    console.log(`[Jobs] ${entry.job.id} saved ${filePath}`);

    if (entry.job.destination !== 'device') {
      fs.rmSync(entry.tempDir, { recursive: true, force: true });
    }
    if (entry.job.destination === 'device') {
      entry.expiry = setTimeout(() => this.expire(entry), DEVICE_FILE_TTL_MS);
    } else {
      this.hooks
        .notify(
          {
            filePath,
            fileName,
            videoTitle: title,
            sourceUrl: entry.request.url,
          },
          entry.request.hooks
        )
        .catch(err => console.error('[Jobs] Hooks had errors', err));
    }
    this.updateParent(entry);
  }

  private finishFailed(entry: Entry, error: string, details: string) {
    fs.rmSync(entry.tempDir, { recursive: true, force: true });
    this.patch(entry, {
      status: 'failed',
      stage: undefined,
      progress: undefined,
      finishedAt: Date.now(),
      error,
      details: details.slice(-4000) || undefined,
    });
    this.updateParent(entry);
  }

  private expire(entry: Entry) {
    fs.rmSync(entry.tempDir, { recursive: true, force: true });
    entry.filePath = undefined;
    this.patch(entry, { downloadable: false });
    if (entry.job.parentId) {
      const parent = this.entries.get(entry.job.parentId);
      if (parent && this.files(parent.job.id).length === 0)
        this.patch(parent, { downloadable: false });
    }
  }

  private updateParent(child: Entry) {
    const parent = child.job.parentId
      ? this.entries.get(child.job.parentId)
      : undefined;
    if (parent) this.refreshCollection(parent);
  }

  private refreshCollection(parent: Entry) {
    const children = parent.children.flatMap(
      id => this.entries.get(id)?.job ?? []
    );
    const done = children.filter(c => c.status === 'done').length;
    const failed = children.filter(
      c => c.status === 'failed' || c.status === 'cancelled'
    ).length;
    const total = children.length;
    const active = children.filter(c => ACTIVE.has(c.status));
    const counts = { total, done, failed };

    if (parent.job.status === 'cancelled' && active.length === 0) {
      this.patch(parent, {
        counts,
        downloadable: parent.job.destination !== 'server' && done > 0,
      });
      return;
    }
    if (active.length > 0) {
      const partial = active.reduce(
        (sum, c) => sum + (c.progress?.percent ?? 0) / 100,
        0
      );
      const current = active.find(c => c.status !== 'queued') ?? active[0];
      this.patch(
        parent,
        {
          status: 'downloading',
          counts,
          stage: current ? `${current.title}` : undefined,
          progress: { percent: ((done + failed + partial) / total) * 100 },
        },
        true
      );
      return;
    }
    this.patch(parent, {
      status: done > 0 ? 'done' : 'failed',
      counts,
      stage: undefined,
      progress: undefined,
      finishedAt: Date.now(),
      error: done > 0 ? undefined : 'None of the items downloaded.',
      downloadable: parent.job.destination !== 'server' && done > 0,
    });
  }

  private prune() {
    const top = [...this.entries.values()].filter(e => !e.job.parentId);
    const excess = top.length - HISTORY_LIMIT;
    if (excess <= 0) return;
    top
      .filter(e => FINISHED.includes(e.job.status))
      .sort((a, b) => a.job.createdAt - b.job.createdAt)
      .slice(0, excess)
      .forEach(e => this.remove(e.job.id));
  }

  /** Applies a change and broadcasts it. Throttled changes (progress) coalesce. */
  private patch(entry: Entry, changes: Partial<Job>, throttle = false) {
    Object.assign(entry.job, changes);
    if (!throttle) return this.emitNow(entry);
    const wait = EMIT_INTERVAL_MS - (Date.now() - entry.lastEmit);
    if (wait <= 0) return this.emitNow(entry);
    entry.pendingEmit ??= setTimeout(() => this.emitNow(entry), wait);
  }

  private emitNow(entry: Entry) {
    clearTimeout(entry.pendingEmit);
    entry.pendingEmit = undefined;
    entry.lastEmit = Date.now();
    this.emit('event', { type: 'job', job: { ...entry.job } });
  }
}
