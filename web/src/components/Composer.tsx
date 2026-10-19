import type { Destination, Format, Job, JobRequest } from '@shared/schemas';
import {
  detect,
  formatsFor,
  GENERIC,
  mediaOf,
  playlistOf,
} from '@shared/services';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  HardDrive,
  Laptop,
  Loader2,
  Scissors,
  TextCursorInput,
} from 'lucide-react';
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { useDebounced } from '@/hooks/use-debounced';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import {
  loadPrefs,
  type Prefs,
  savePrefs,
  type Settings,
  toHookConfig,
} from '@/lib/settings';
import { cn } from '@/lib/utils';
import { FolderPicker } from './FolderPicker';
import { MediaPreview } from './MediaPreview';
import { TrimControl } from './TrimControl';
import { UrlField } from './UrlField';

const FORMAT_LABEL: Record<Format, string> = {
  mp4: 'Video',
  mp3: 'MP3',
  wav: 'WAV',
};
const FORMAT_HINT: Record<Format, string> = {
  mp4: 'MP4, up to 1080p',
  mp3: 'MP3, best quality VBR',
  wav: 'Lossless WAV',
};

const DESTINATIONS: {
  value: Destination;
  label: string;
  icon: typeof HardDrive;
}[] = [
  { value: 'server', label: 'Library', icon: HardDrive },
  { value: 'device', label: 'This device', icon: Laptop },
  { value: 'both', label: 'Both', icon: ArrowDownToLine },
];

interface ItemOptions {
  key: string;
  trimOn: boolean;
  /** null means the full length. */
  trim: [number, number] | null;
  renameOn: boolean;
  rename: string;
}

const freshOptions = (key: string): ItemOptions => ({
  key,
  trimOn: false,
  trim: null,
  renameOn: false,
  rename: '',
});

interface Props {
  settings: Settings;
  onQueued: (job: Job) => void;
}

export function Composer({ settings, onQueued }: Props) {
  const urlRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [itemOptions, setItemOptions] = useState<ItemOptions>(() =>
    freshOptions('')
  );

  const setPrefs = (update: (p: Prefs) => Prefs) =>
    setPrefsState(p => {
      const next = update(p);
      savePrefs(next);
      return next;
    });

  const pasted = useMemo(() => detect(url), [url]);
  // A video opened from a playlist can stand for the whole playlist.
  const playlistUrl = pasted ? playlistOf(pasted.url) : null;
  const [wholePlaylistFor, setWholePlaylistFor] = useState<string | null>(null);
  const wholePlaylist = !!playlistUrl && wholePlaylistFor === url;
  const detected = useMemo(
    () => (wholePlaylist && playlistUrl ? detect(playlistUrl) : pasted),
    [wholePlaylist, playlistUrl, pasted]
  );
  const debouncedUrl = useDebounced(detected?.url.href ?? null, 350);
  const service = detected?.service ?? GENERIC;

  const info = useQuery({
    queryKey: ['info', debouncedUrl, !!settings.cookies],
    queryFn: ({ signal }) => api.info(debouncedUrl!, settings.cookies, signal),
    enabled: !!debouncedUrl && debouncedUrl === detected?.url.href,
    staleTime: 5 * 60_000,
  });
  const ready = !!detected && debouncedUrl === detected.url.href;
  const data = ready ? info.data : undefined;

  const formats = formatsFor(service);
  const remembered = prefs.formatByService[service.id];
  const format: Format =
    remembered && formats.includes(remembered)
      ? remembered
      : service.defaultFormat;
  const media = mediaOf(format);
  const folder = prefs.folderByMedia[media] ?? '';
  const destination = prefs.destination;
  const toLibrary = destination !== 'device';
  const toDevice = destination !== 'server';

  const collection = !!data?.collection || detected?.collection === true;
  const count = data?.collection?.count;
  const duration = !collection ? data?.duration : undefined;

  // Trim and rename belong to one link; a new link starts fresh.
  const optionsKey = detected?.url.href ?? '';
  const options =
    itemOptions.key === optionsKey ? itemOptions : freshOptions(optionsKey);
  const setOptions = (patch: Partial<ItemOptions>) =>
    setItemOptions({ ...options, ...patch, key: optionsKey });
  const { trimOn, renameOn, rename } = options;
  const trim: [number, number] = options.trim ?? [0, duration ?? 0];

  // ⌘K / Ctrl+K focuses the link field from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        urlRef.current?.focus();
        urlRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const trimmed = trimOn && !!duration && (trim[0] > 0 || trim[1] < duration);
  const renamed = renameOn && !collection && rename.trim() !== '';

  const submit = useMutation({
    mutationFn: (body: JobRequest) => api.createJob(body),
    onSuccess: job => {
      onQueued(job);
      toast.success('Added to queue', {
        description: data?.title ?? job.title,
      });
      setUrl('');
      urlRef.current?.focus();
    },
    onError: err => toast.error(err.message),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!detected || submit.isPending) return;
    submit.mutate({
      url: detected.url.href,
      format,
      destination,
      folder: toLibrary ? folder.trim() || undefined : undefined,
      rename: renamed ? rename.trim() : undefined,
      trim: trimmed ? { start: trim[0], end: trim[1] } : undefined,
      label: data?.title,
      cookies: settings.cookies || undefined,
      hooks: toLibrary ? toHookConfig(settings) : undefined,
    });
  };

  // Where the file will land, spelled out.
  const baseName = renamed ? rename.trim() : (data?.title ?? 'title');
  const suffix = trimmed
    ? ` (${formatDuration(trim[0])}–${formatDuration(trim[1])})`
    : '';
  const folderPath = [
    media === 'audio' ? 'audio' : 'videos',
    folder.trim() || (collection ? (data?.title ?? 'playlist name') : ''),
  ]
    .filter(Boolean)
    .join('/');
  const itemsLabel = collection
    ? count
      ? `${count} items`
      : 'every item'
    : null;

  const action = (() => {
    const what = itemsLabel ? ` ${itemsLabel}` : '';
    if (destination === 'server') return `Save${what} to library`;
    if (destination === 'device') return `Download${what} to this device`;
    return `Save${what} and download`;
  })();

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="New download">
      <UrlField ref={urlRef} value={url} onChange={setUrl} detected={pasted} />

      {playlistUrl && (
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">
            This video is part of a playlist
          </legend>
          <Segmented
            aria-label="Download"
            value={wholePlaylist ? 'playlist' : 'video'}
            onValueChange={v =>
              setWholePlaylistFor(v === 'playlist' ? url : null)
            }
          >
            <SegmentedItem value="video">This video</SegmentedItem>
            <SegmentedItem value="playlist">Whole playlist</SegmentedItem>
          </Segmented>
        </fieldset>
      )}

      {detected && (ready || info.isFetching) && (
        <MediaPreview
          key={detected.url.href}
          detected={detected}
          info={data}
          loading={!ready || info.isFetching}
          error={ready ? info.error : null}
        />
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-medium">Format</legend>
        <Segmented
          aria-label="Format"
          value={format}
          onValueChange={f =>
            setPrefs(p => ({
              ...p,
              formatByService: { ...p.formatByService, [service.id]: f },
            }))
          }
        >
          {(['mp4', 'mp3', 'wav'] as const).map(f => (
            <SegmentedItem key={f} value={f} disabled={!formats.includes(f)}>
              {FORMAT_LABEL[f]}
            </SegmentedItem>
          ))}
        </Segmented>
        <p className="text-[13px] text-muted-foreground">
          {FORMAT_HINT[format]}
          {service.audioOnly && ' · audio-only source'}
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-medium">Save to</legend>
        <Segmented
          aria-label="Save to"
          value={destination}
          onValueChange={d => setPrefs(p => ({ ...p, destination: d }))}
        >
          {DESTINATIONS.map(({ value, label, icon: Icon }) => (
            <SegmentedItem key={value} value={value}>
              <Icon className="size-4 shrink-0 max-[360px]:hidden" />
              <span className="truncate">{label}</span>
            </SegmentedItem>
          ))}
        </Segmented>
      </fieldset>

      {toLibrary && (
        <FolderPicker
          media={media}
          value={folder}
          onChange={v =>
            setPrefs(p => ({
              ...p,
              folderByMedia: { ...p.folderByMedia, [media]: v },
            }))
          }
          placeholder={collection ? 'Playlist name' : 'Top level'}
        />
      )}

      {!collection && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <OptionToggle
              pressed={trimOn}
              onPressedChange={v => setOptions({ trimOn: v })}
              disabled={!duration}
              icon={<Scissors />}
              title={
                duration ? undefined : 'Available once the length is known'
              }
            >
              Trim
            </OptionToggle>
            <OptionToggle
              pressed={renameOn}
              onPressedChange={v => setOptions({ renameOn: v })}
              icon={<TextCursorInput />}
            >
              Rename
            </OptionToggle>
          </div>
          {trimOn && duration && (
            <TrimControl
              duration={duration}
              value={trim}
              onChange={t => setOptions({ trim: t })}
            />
          )}
          {renameOn && (
            <div>
              <label
                htmlFor="rename"
                className="mb-2 block text-[13px] font-medium"
              >
                File name
              </label>
              <Input
                id="rename"
                value={rename}
                onChange={e => setOptions({ rename: e.target.value })}
                placeholder={data?.title ?? 'Uses the media title'}
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 border-t pt-5">
        <dl
          className="space-y-1 text-[13px]"
          hidden={!detected}
          aria-live="polite"
        >
          {toLibrary && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted-foreground">Library</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-mono">{folderPath}/</span>
                {itemsLabel ? (
                  <span className="text-muted-foreground"> {itemsLabel}</span>
                ) : (
                  <span className="font-mono text-muted-foreground">
                    {`${baseName}${suffix}.${format}`}
                  </span>
                )}
              </dd>
            </div>
          )}
          {toDevice && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted-foreground">Device</dt>
              <dd className="min-w-0">
                {collection
                  ? 'One .zip in your Downloads'
                  : 'Your browser’s Downloads folder'}
              </dd>
            </div>
          )}
        </dl>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!detected || submit.isPending}
        >
          {submit.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ArrowDownToLine />
          )}
          {submit.isPending ? 'Adding…' : action}
        </Button>
      </div>
    </form>
  );
}

function OptionToggle({
  pressed,
  onPressedChange,
  icon,
  children,
  disabled,
  title,
}: {
  pressed: boolean;
  onPressedChange: (v: boolean) => void;
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5',
        pressed && 'border-primary/50 bg-accent text-foreground'
      )}
    >
      {icon}
      {children}
    </button>
  );
}
