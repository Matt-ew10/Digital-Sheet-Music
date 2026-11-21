"use client";

import Stepper from "@/components/stepper";
import type { Condition } from "@/lib/score/conditions";
import settings from "@/settings";

// The options of the chosen condition, shown beside it: the note spacing of the simplified
// layout and the page color of condition 3. They sit before the condition menu in a group
// aligned to the right, so appearing grows the group leftward and the menu stays in place.
export default function ConditionOptions({
  condition,
  spacing,
  tint,
  onSpacing,
  onTint,
}: Props) {
  if (condition.spacing) {
    return (
      <div className="flex items-center gap-3">
        <span className="whitespace-nowrap text-muted-foreground">Note spacing</span>
        <Stepper
          value={spacing}
          least={1}
          most={settings.spacing.widest}
          step={0.1}
          nudge={0.5}
          label="Note spacing"
          onChange={onSpacing}
        />
        <span className="w-9 text-right tabular-nums">{spacing.toFixed(1)}×</span>
      </div>
    );
  }

  if (condition.tint) {
    return (
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Page color">
        <span className="mr-1 whitespace-nowrap text-muted-foreground">Page color</span>
        {settings.tint.colors.map((color) => (
          <button
            key={color.value}
            type="button"
            role="radio"
            aria-checked={color.value === tint}
            aria-label={color.name}
            title={color.name}
            className="size-6 rounded-sm border border-foreground/20 ring-offset-2 ring-offset-background aria-checked:ring-2 aria-checked:ring-foreground"
            style={{ background: color.value }}
            onClick={() => onTint(color.value)}
          />
        ))}
      </div>
    );
  }

  return null;
}

interface Props {
  condition: Condition;
  spacing: number;
  tint: string;
  onSpacing: (spacing: number) => void;
  onTint: (tint: string) => void;
}
