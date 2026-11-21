"use client";

import { Metronome, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import settings from "@/settings";

// Controls that float over the bottom of the score, so showing one does not move the toolbar.

// The tempo the player follows, in the beats they count, and the metronome that keeps it. The
// tempo is set before following starts; the metronome runs on its own and changes with it, and
// is `held` on or off while pitch feedback follows, since the judge listens for its clicks.
export function TempoControl({
  tempo,
  beat,
  locked,
  ticking,
  held,
  onTempo,
  onMetronome,
}: {
  tempo: number;
  beat: number;
  locked: boolean;
  ticking: boolean;
  held: boolean;
  onTempo: (tempo: number) => void;
  onMetronome: () => void;
}) {
  const { slowest, fastest } = settings.tempo;

  return (
    <div className={panel}>
      <span className="whitespace-nowrap tabular-nums">
        {symbols[beat] ?? "♩"} = {tempo}
      </span>
      <Stepper
        value={tempo}
        least={slowest}
        most={fastest}
        step={1}
        nudge={4}
        disabled={locked}
        label="Tempo"
        onChange={onTempo}
      />
      <Button
        variant={ticking ? "default" : "outline"}
        size="icon-lg"
        aria-label={ticking ? "Stop the metronome" : "Start the metronome"}
        aria-pressed={ticking}
        disabled={held}
        onClick={onMetronome}
      >
        <Metronome />
      </Button>
    </div>
  );
}

// How much wider notes are spaced in the simplified layout, for the person running the session
// to fit the player.
export function SpacingControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className={panel}>
      <span className="whitespace-nowrap text-muted-foreground">Note spacing</span>
      <Stepper
        value={value}
        least={1}
        most={settings.spacing.widest}
        step={0.1}
        nudge={0.5}
        label="Note spacing"
        onChange={onChange}
      />
      <span className="w-9 text-right tabular-nums">{value.toFixed(1)}×</span>
    </div>
  );
}

// The color of the page in condition 3, from the research team's choices.
export function TintControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={panel} role="radiogroup" aria-label="Page color">
      <span className="whitespace-nowrap text-muted-foreground">Page color</span>
      {settings.tint.colors.map((color) => (
        <button
          key={color.value}
          type="button"
          role="radio"
          aria-checked={color.value === value}
          aria-label={color.name}
          title={color.name}
          className="size-9 rounded-full border border-foreground/20 ring-offset-2 ring-offset-background aria-checked:ring-2 aria-checked:ring-foreground"
          style={{ background: color.value }}
          onClick={() => onChange(color.value)}
        />
      ))}
    </div>
  );
}

// A slider between buttons that step it, large enough to use on a tablet.
function Stepper({
  value,
  least,
  most,
  step,
  nudge,
  disabled,
  label,
  onChange,
}: {
  value: number;
  least: number;
  most: number;
  step: number;
  nudge: number;
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
}) {
  function move(by: number) {
    onChange(Math.min(Math.max(Math.round((value + by) / step) * step, least), most));
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon-lg"
        aria-label={`Less ${label.toLowerCase()}`}
        disabled={disabled || value <= least}
        onClick={() => move(-nudge)}
      >
        <Minus />
      </Button>
      <Slider
        className="shrink-0 data-horizontal:w-48 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-track]]:h-2"
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
        size="icon-lg"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={disabled || value >= most}
        onClick={() => move(nudge)}
      >
        <Plus />
      </Button>
    </>
  );
}

const panel =
  "flex items-center gap-3 rounded-xl border bg-background/95 px-3 py-2 text-sm shadow-md";

// Note symbols for a beat of so many quarter notes.
const symbols: Record<number, string> = { 1: "♩", 1.5: "♩.", 2: "𝅗𝅥" };
