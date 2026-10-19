import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Segmented control: a single-select toggle group that never deselects. */
function Segmented<T extends string>({
  value,
  onValueChange,
  className,
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof ToggleGroupPrimitive.Root>,
  'type' | 'value' | 'onValueChange' | 'defaultValue'
> & {
  value: T;
  onValueChange: (value: T) => void;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={v => v && onValueChange(v as T)}
      className={cn(
        'grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1',
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Root>
  );
}

function SegmentedItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-150 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_2px_oklch(0_0_0/0.12),0_0_0_1px_var(--border)]',
        className
      )}
      {...props}
    />
  );
}

export { Segmented, SegmentedItem };
