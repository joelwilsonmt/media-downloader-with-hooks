import { Slider as SliderPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

function Slider({
  className,
  value,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      value={value}
      className={cn(
        'relative flex h-10 w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-track">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {(value ?? []).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={i === 0 ? 'Start' : 'End'}
          className="relative block size-5 rounded-full border-2 border-primary bg-card shadow-[0_1px_3px_oklch(0_0_0/0.25)] transition-[box-shadow] before:absolute before:-inset-3 before:content-[''] hover:ring-4 hover:ring-ring/20 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
