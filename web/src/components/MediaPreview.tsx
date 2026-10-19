import type { MediaInfo } from '@shared/schemas';
import type { Detected } from '@shared/services';
import { AlertCircle, ImageOff, ListMusic, Play, X } from 'lucide-react';
import { useState } from 'react';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  detected: Detected;
  info: MediaInfo | undefined;
  loading: boolean;
  error: Error | null;
}

export function MediaPreview({ detected, info, loading, error }: Props) {
  const [playing, setPlaying] = useState(false);
  const embed = detected.service.embed?.(detected.url) ?? null;
  const square = !!detected.service.audioOnly;

  if (loading) {
    return (
      <div className="flex items-center gap-3" aria-live="polite">
        <div
          className={cn(
            'shrink-0 animate-pulse rounded-md bg-muted',
            square ? 'size-16' : 'h-16 w-28'
          )}
        />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <span className="sr-only">Looking up link</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="status" className="flex gap-2.5 text-[13px]">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p>
          <span className="text-foreground">{error.message}</span>{' '}
          <span className="text-muted-foreground">
            You can still try the download.
          </span>
        </p>
      </div>
    );
  }

  if (!info) return null;

  const meta = [
    info.uploader,
    info.collection
      ? `${info.collection.count} ${info.collection.count === 1 ? 'item' : 'items'}`
      : null,
    info.duration ? formatDuration(info.duration) : null,
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!embed}
          onClick={() => setPlaying(p => !p)}
          aria-label={playing ? 'Hide player' : 'Play preview'}
          className={cn(
            'group relative shrink-0 overflow-hidden rounded-md bg-muted disabled:cursor-default',
            square ? 'size-16' : 'h-16 w-28'
          )}
        >
          {info.thumbnail ? (
            <img
              src={info.thumbnail}
              alt=""
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center text-muted-foreground">
              {info.collection ? (
                <ListMusic className="size-5" />
              ) : (
                <ImageOff className="size-5" />
              )}
            </span>
          )}
          {embed && (
            <span className="absolute inset-0 grid place-items-center bg-[oklch(0.1_0_0/0.35)] text-white opacity-90 transition-opacity group-hover:opacity-100">
              {playing ? (
                <X className="size-5" />
              ) : (
                <Play className="size-5 fill-current" />
              )}
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className="line-clamp-2 leading-snug font-medium"
            title={info.title}
          >
            {info.title}
          </p>
          {meta.length > 0 && (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              {meta.map((m, i) => (
                <span
                  key={i}
                  className={cn(
                    i > 0 && "before:mx-1.5 before:content-['·']",
                    /\d:\d/.test(String(m)) && 'font-mono'
                  )}
                >
                  {m}
                </span>
              ))}
            </p>
          )}
          {!!info.ageLimit && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Age-restricted. Needs cookies in Settings.
            </p>
          )}
        </div>
      </div>
      {playing && embed && (
        <iframe
          title={`${detected.service.label} player`}
          src={embed.src}
          className={cn(
            'w-full rounded-lg border bg-black',
            !embed.height && 'aspect-video'
          )}
          style={embed.height ? { height: embed.height } : undefined}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      )}
    </div>
  );
}
