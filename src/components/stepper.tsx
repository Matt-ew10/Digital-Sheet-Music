"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

// A slider between buttons that step it, large enough to use on a tablet.
export default function Stepper({
  value,
  least,
  most,
  step,
  nudge,
  disabled,
  label,
  onChange,
}: Props) {
  function move(by: number) {
    onChange(Math.min(Math.max(Math.round((value + by) / step) * step, least), most));
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label={`Less ${label.toLowerCase()}`}
        disabled={disabled || value <= least}
        onClick={() => move(-nudge)}
      >
        <Minus />
      </Button>
      <Slider
        className="shrink-0 data-horizontal:w-40 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-track]]:h-2"
        aria-label={label}
        min={least}
        max={most}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
      />
      <Button
        variant="outline"
        size="icon"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={disabled || value >= most}
        onClick={() => move(nudge)}
      >
        <Plus />
      </Button>
    </div>
  );
}

interface Props {
  value: number;
  least: number;
  most: number;
  step: number;
  nudge: number;
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
}
