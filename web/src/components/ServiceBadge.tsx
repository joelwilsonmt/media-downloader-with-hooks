import type { Service } from '@shared/services';
import { cn } from '@/lib/utils';

export function ServiceBadge({
  service,
  className,
}: {
  service: Service;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[12px] leading-none font-medium text-foreground',
        className
      )}
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: service.color }}
      />
      {service.label}
    </span>
  );
}
