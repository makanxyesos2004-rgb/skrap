import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-pan-x items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col group",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "bg-secondary relative grow overflow-hidden rounded-full cursor-pointer",
          "data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full",
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1",
          "group-hover:data-[orientation=horizontal]:h-1.5 transition-all"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "bg-primary absolute rounded-full",
            "data-[orientation=horizontal]:h-full",
            "data-[orientation=vertical]:w-full"
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            "block size-3 shrink-0 rounded-full bg-primary shadow-sm",
            "transition-all duration-150",
            "opacity-0 group-hover:opacity-100 group-active:opacity-100",
            "hover:size-4 focus-visible:size-4 active:size-4",
            "ring-primary/20 hover:ring-4 focus-visible:ring-4",
            "focus-visible:outline-none",
            "disabled:pointer-events-none disabled:opacity-50",
            // Always show on touch devices
            "touch-device:opacity-100"
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
