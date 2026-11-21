"use client";

import { Settings2 } from "lucide-react";
import Stepper from "@/components/stepper";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Condition } from "@/lib/score/conditions";
import settings from "@/settings";

// The options of the chosen condition, behind a button that stays in place whatever the
// condition, so choosing one does not move the toolbar: the note spacing of the simplified
// layout and the page color of condition 3. Conditions without options leave it disabled.
export default function ConditionOptions({
  condition,
  spacing,
  tint,
  onSpacing,
  onTint,
}: Props) {
  const empty = !condition.spacing && !condition.tint;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Condition options"
            disabled={empty}
          />
        }
      >
        <Settings2 />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto gap-3 p-3">
        {condition.spacing && (
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
        )}
        {condition.tint && (
          <div className="flex items-center gap-3" role="radiogroup" aria-label="Page color">
            <span className="whitespace-nowrap text-muted-foreground">Page color</span>
            {settings.tint.colors.map((color) => (
              <button
                key={color.value}
                type="button"
                role="radio"
                aria-checked={color.value === tint}
                aria-label={color.name}
                title={color.name}
                className="size-9 rounded-full border border-foreground/20 ring-offset-2 ring-offset-background aria-checked:ring-2 aria-checked:ring-foreground"
                style={{ background: color.value }}
                onClick={() => onTint(color.value)}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  condition: Condition;
  spacing: number;
  tint: string;
  onSpacing: (spacing: number) => void;
  onTint: (tint: string) => void;
}
