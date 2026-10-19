import { useQuery } from '@tanstack/react-query';
import { Folder, FolderPlus, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { api } from '@/lib/api';

interface Props {
  media: 'audio' | 'video';
  value: string;
  onChange: (value: string) => void;
  /** Shown when empty, e.g. a playlist's own name. */
  placeholder: string;
}

export function FolderPicker({ media, value, onChange, placeholder }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = media === 'audio' ? 'audio' : 'videos';
  const folders = useQuery({
    queryKey: ['folders', media],
    queryFn: () => api.folders(media),
    staleTime: 0,
  });

  const query = value.trim().toLowerCase();
  const matches = (folders.data ?? []).filter(f =>
    f.toLowerCase().includes(query)
  );
  const isNew =
    query !== '' && !(folders.data ?? []).some(f => f.toLowerCase() === query);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-medium">
        Folder
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="flex h-10 items-center rounded-md border border-input bg-card pr-1 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
            <span className="pl-3 font-mono text-[13px] text-muted-foreground select-none">
              {root}/
            </span>
            <input
              id={id}
              value={value}
              autoComplete="off"
              placeholder={placeholder}
              onChange={e => {
                onChange(e.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                setOpen(true);
                void folders.refetch();
              }}
              onKeyDown={e => e.key === 'Escape' && setOpen(false)}
              role="combobox"
              aria-expanded={open}
              aria-controls={`${id}-list`}
              className="h-full min-w-0 flex-1 bg-transparent pl-0.5 text-[16px] outline-none placeholder:text-muted-foreground/80 focus-visible:outline-none sm:text-sm"
            />
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange('')}
                aria-label="Save to the top level"
              >
                <X />
              </Button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          id={`${id}-list`}
          role="listbox"
          onOpenAutoFocus={e => e.preventDefault()}
          onInteractOutside={e => {
            if ((e.target as HTMLElement).id === id) e.preventDefault();
          }}
          className="max-h-64 overflow-y-auto"
        >
          {isNew && (
            <FolderOption
              onSelect={() => pick(value.trim())}
              icon={<FolderPlus />}
            >
              New folder{' '}
              <span className="font-mono">
                {root}/{value.trim()}
              </span>
            </FolderOption>
          )}
          {matches.map(f => (
            <FolderOption
              key={f}
              onSelect={() => pick(f)}
              icon={<Folder />}
              selected={f === value}
            >
              {f}
            </FolderOption>
          ))}
          {!isNew && matches.length === 0 && (
            <p className="px-2.5 py-2 text-[13px] text-muted-foreground">
              {folders.isLoading
                ? 'Loading folders…'
                : `No folders in ${root}/ yet. Type a name to create one.`}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FolderOption({
  children,
  icon,
  selected,
  onSelect,
}: {
  children: ReactNode;
  icon: ReactNode;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none aria-selected:font-medium [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}
