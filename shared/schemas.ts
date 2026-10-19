import { z } from 'zod';

export const FormatSchema = z.enum(['mp4', 'mp3', 'wav']);
export type Format = z.infer<typeof FormatSchema>;

export const DestinationSchema = z.enum(['server', 'device', 'both']);
export type Destination = z.infer<typeof DestinationSchema>;

export const HookConfigSchema = z.object({
  tiktok: z
    .object({
      clientKey: z.string(),
      clientSecret: z.string(),
      accessToken: z.string(),
      title: z.string(),
    })
    .partial()
    .optional(),
  slack: z.array(z.object({ webhookUrl: z.string() })).optional(),
  webhook: z.array(z.object({ url: z.string() })).optional(),
});
export type HookConfig = z.infer<typeof HookConfigSchema>;

export const InfoRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  cookies: z.string().max(5_000_000).optional(),
});

export interface MediaInfo {
  title: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  ageLimit?: number;
  /** Present when the URL resolves to many items. */
  collection?: { count: number };
}

export const TrimSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(1),
  })
  .refine(t => t.end > t.start, { message: 'Trim end must be after start' });

export const JobRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  format: FormatSchema,
  destination: DestinationSchema,
  /** Folder under audio/ or videos/. Nested paths allowed; never escapes the root. */
  folder: z.string().max(200).optional(),
  /** Overrides the file name (without extension). Single items only. */
  rename: z.string().max(200).optional(),
  trim: TrimSchema.optional(),
  /** Shown in the queue until the real title is known. */
  label: z.string().max(300).optional(),
  cookies: z.string().max(5_000_000).optional(),
  hooks: HookConfigSchema.optional(),
});
export type JobRequest = z.infer<typeof JobRequestSchema>;

export type JobStatus =
  | 'resolving'
  | 'queued'
  | 'downloading'
  | 'processing'
  | 'done'
  | 'failed'
  | 'cancelled';

export const FINISHED: readonly JobStatus[] = ['done', 'failed', 'cancelled'];

export interface JobProgress {
  percent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  /** bytes per second */
  speed?: number;
  /** seconds */
  eta?: number;
}

/** A job as the browser sees it. */
export interface Job {
  id: string;
  parentId?: string;
  kind: 'item' | 'collection';
  url: string;
  service: string;
  title: string;
  format: Format;
  destination: Destination;
  /** Display path relative to the download root, e.g. "audio/Lo-fi". */
  folder: string;
  status: JobStatus;
  stage?: string;
  progress?: JobProgress;
  fileName?: string;
  sizeBytes?: number;
  error?: string;
  details?: string;
  createdAt: number;
  finishedAt?: number;
  /** Collections only. */
  counts?: { total: number; done: number; failed: number };
  /** The file (or zip, for a collection) can be fetched at /api/jobs/:id/file. */
  downloadable: boolean;
}

export type ServerEvent =
  | { type: 'snapshot'; jobs: Job[] }
  | { type: 'job'; job: Job }
  | { type: 'remove'; ids: string[] };
