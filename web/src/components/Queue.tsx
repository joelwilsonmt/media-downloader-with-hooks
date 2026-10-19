import { FINISHED, type Job } from '@shared/schemas';
import { getService, type ServiceId } from '@shared/services';
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Clock,
  Download,
  Loader2,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Connection } from '@/hooks/use-jobs';
import { api, saveToDevice } from '@/lib/api';
import { formatBytes, formatEta, formatSpeed } from '@/lib/format';
import { cn } from '@/lib/utils';

const isActive = (j: Job) => !FINISHED.includes(j.status);

const act = (fn: () => Promise<unknown>) => () => {
  fn().catch(err =>
    toast.error(err instanceof Error ? err.message : 'Something went wrong')
  );
};

export function Queue({
  jobs,
  connection,
}: {
  jobs: Map<string, Job>;
  connection: Connection;
}) {
  const all = [...jobs.values()];
  const top = all
    .filter(j => !j.parentId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const childrenOf = (id: string) =>
    all
      .filter(j => j.parentId === id)
      .sort((a, b) => a.createdAt - b.createdAt);
  const active = top.filter(isActive).length;
  const finished = top.length - active;

  return (
    <section aria-labelledby="queue-heading" className="min-w-0">
      <div className="mb-3 flex h-9 items-center gap-3">
        <h2 id="queue-heading" className="text-lg font-semibold tracking-tight">
          Queue
        </h2>
        <p
          className="flex-1 text-[13px] text-muted-foreground"
          aria-live="polite"
        >
          {connection === 'open' ? (
            [active && `${active} active`, finished && `${finished} finished`]
              .filter(Boolean)
              .join(' · ')
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              {connection === 'connecting'
                ? 'Connecting to server…'
                : 'Lost connection. Retrying…'}
            </span>
          )}
        </p>
        {finished > 0 && (
          <Button variant="ghost" size="sm" onClick={act(api.clearFinished)}>
            Clear finished
          </Button>
        )}
      </div>

      {top.length === 0 ? (
        <div className="rounded-lg border border-dashed px-5 py-10 text-center">
          <p className="font-medium">Nothing queued</p>
          <p className="mx-auto mt-1 max-w-[42ch] text-[13px] text-muted-foreground">
            Downloads run on the server, so you can close this tab or lock your
            phone. Progress shows up on any device that opens this page.
          </p>
        </div>
      ) : (
        <ul className="divide-y border-y">
          {top.map(job => (
            <JobRow
              key={job.id}
              job={job}
              items={job.kind === 'collection' ? childrenOf(job.id) : []}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusIcon({ job, className }: { job: Job; className?: string }) {
  const cls = cn('size-4.5 shrink-0', className);
  switch (job.status) {
    case 'done':
      return (
        <CircleCheck className={cn(cls, 'text-success')} aria-label="Done" />
      );
    case 'failed':
      return (
        <CircleAlert
          className={cn(cls, 'text-destructive')}
          aria-label="Failed"
        />
      );
    case 'cancelled':
      return (
        <CircleSlash
          className={cn(cls, 'text-muted-foreground')}
          aria-label="Cancelled"
        />
      );
    case 'queued':
      return (
        <Clock
          className={cn(cls, 'text-muted-foreground')}
          aria-label="Waiting"
        />
      );
    default:
      return (
        <Loader2
          className={cn(cls, 'animate-spin text-primary')}
          aria-label="Working"
        />
      );
  }
}

function statusText(job: Job): string {
  const p = job.progress;
  switch (job.status) {
    case 'resolving':
      return 'Reading link…';
    case 'queued':
      return 'Waiting';
    case 'processing':
      return job.stage ?? 'Processing';
    case 'downloading':
      if (job.kind === 'collection' && job.counts) {
        const { done, failed, total } = job.counts;
        return `${done + failed} of ${total}${failed ? ` · ${failed} failed` : ''}`;
      }
      if (!p) return job.stage ?? 'Starting';
      return [
        p.percent != null ? `${Math.floor(p.percent)}%` : null,
        p.speed ? formatSpeed(p.speed) : null,
        p.eta ? formatEta(p.eta) : null,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'done':
      if (job.kind === 'collection' && job.counts) {
        const { done, failed, total } = job.counts;
        return failed
          ? `${done} of ${total} saved · ${failed} failed`
          : `${total} saved`;
      }
      return job.sizeBytes ? formatBytes(job.sizeBytes) : 'Saved';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
  }
}

function where(job: Job): string {
  if (job.destination === 'device') return 'This device';
  return job.destination === 'both' ? `${job.folder} + device` : job.folder;
}

function JobRow({
  job,
  items,
  nested = false,
}: {
  job: Job;
  items: Job[];
  nested?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = isActive(job);
  const percent = job.progress?.percent;
  const service = getService(job.service as ServiceId);
  const failedChildren = items.filter(c => c.status === 'failed').length;

  return (
    <li className={cn(nested ? 'py-2' : 'py-3.5')}>
      <div className="flex items-start gap-3">
        <StatusIcon job={job} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {job.kind === 'collection' ? (
              <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="-ml-1 flex min-w-0 items-center gap-1 rounded px-1 text-left hover:bg-muted"
              >
                <ChevronRight
                  className={cn(
                    'size-4 shrink-0 transition-transform',
                    open && 'rotate-90'
                  )}
                />
                <span className="truncate font-medium">{job.title}</span>
              </button>
            ) : (
              <p
                className={cn(
                  'truncate',
                  nested ? 'text-[13px]' : 'font-medium'
                )}
                title={job.title}
              >
                {job.title}
              </p>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[13px] text-muted-foreground">
            <span className="tabular">{statusText(job)}</span>
            {!nested && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: service.color }}
                  />
                  {job.format.toUpperCase()}
                </span>
                <span aria-hidden>·</span>
                <span
                  className={cn(
                    'min-w-0 truncate',
                    job.destination !== 'device' && 'font-mono'
                  )}
                >
                  {where(job)}
                </span>
              </>
            )}
          </p>
          {active && job.status !== 'queued' && (
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-track"
              role="progressbar"
              aria-valuenow={percent ? Math.floor(percent) : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  'h-full rounded-full bg-primary transition-[width] duration-300 ease-out',
                  percent == null && 'w-1/3 animate-pulse'
                )}
                style={
                  percent != null
                    ? { width: `${Math.max(2, percent)}%` }
                    : undefined
                }
              />
            </div>
          )}
          {job.error && (
            <div className="mt-1.5 text-[13px]">
              <p className="text-destructive">{job.error}</p>
              {job.details && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    yt-dlp output
                  </summary>
                  <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-muted p-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                    {job.details}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="-mt-1.5 -mr-2 flex shrink-0 items-center">
          {job.downloadable && (
            <Button
              variant="ghost"
              size={nested ? 'icon-sm' : 'sm'}
              onClick={() => saveToDevice(job.id)}
              aria-label={
                job.kind === 'collection'
                  ? 'Save zip to this device'
                  : 'Save to this device'
              }
              title="Save to this device"
            >
              <Download />
              {!nested && (
                <span className="max-sm:hidden">
                  {job.kind === 'collection' ? 'Zip' : 'Save'}
                </span>
              )}
            </Button>
          )}
          {active && (
            <Button
              variant="danger"
              size="icon-sm"
              onClick={act(() => api.cancel(job.id))}
              aria-label="Cancel"
              title="Cancel"
            >
              <X />
            </Button>
          )}
          {(job.status === 'failed' ||
            job.status === 'cancelled' ||
            (job.kind === 'collection' && failedChildren > 0 && !active)) && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={act(() => api.retry(job.id))}
              aria-label="Retry"
              title="Retry"
            >
              <RotateCw />
            </Button>
          )}
          {!active && !nested && (
            <Button
              variant="danger"
              size="icon-sm"
              onClick={act(() => api.remove(job.id))}
              aria-label="Remove from list"
              title="Remove from list"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      {open && items.length > 0 && (
        <ul className="mt-2 ml-7.5 divide-y border-l pl-3">
          {items.map(c => (
            <JobRow key={c.id} job={c} items={[]} nested />
          ))}
        </ul>
      )}
    </li>
  );
}
