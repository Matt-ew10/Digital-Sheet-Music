"use client";

import {
  useRef,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileAudio,
  FolderOpen,
  Metronome,
  Mic,
  Square,
} from "lucide-react";
import Stepper from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { conditions } from "@/lib/score/conditions";
import scores from "@/lib/score/list";
import settings from "@/settings";

// The experiment's excerpts by group, and a button to open any other MusicXML file. A file
// opened that way shows in the list until another score is picked.
export function ScorePicker({
  chosen,
  opened,
  disabled,
  onChoose,
  onOpen,
}: {
  chosen?: string;
  opened?: string;
  disabled: boolean;
  onChoose: (file: string) => void;
  onOpen: (file: File) => void;
}) {
  const groups = [...new Set(scores.map((score) => score.group))];
  const labels = Object.fromEntries([
    ["", opened],
    ...scores.map((score) => [score.file, caption(score)]),
  ]);

  return (
    <div className="flex items-center gap-1">
      <Select
        items={labels}
        value={chosen ?? ""}
        disabled={disabled}
        onValueChange={(file) => file && onChoose(file)}
      >
        <SelectTrigger aria-label="Score" className="max-w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-auto min-w-(--anchor-width) max-w-(--available-width)">
          {opened && !chosen && <SelectItem value="">{opened}</SelectItem>}
          {groups.map((group) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {scores
                .filter((score) => score.group === group)
                .map((score) => (
                  <SelectItem key={score.file} value={score.file}>
                    {caption(score)}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <FilePicker
        label="Open a MusicXML file"
        accept=".musicxml,.xml,.mxl"
        disabled={disabled}
        onPick={onOpen}
      >
        <FolderOpen />
      </FilePicker>
    </div>
  );
}

// One action, two sources: the cursor follows whatever it hears.
export function FollowControls({
  source,
  onMicrophone,
  onRecording,
  onStop,
}: {
  source?: string;
  onMicrophone: () => void;
  onRecording: (file: File) => void;
  onStop: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">Follow</span>

      {source !== undefined ? (
        <Button variant="outline" onClick={onStop}>
          <Square fill="currentColor" />
          Stop
          <span className="max-w-40 truncate text-muted-foreground">
            {source}
          </span>
        </Button>
      ) : (
        <ButtonGroup>
          <Button variant="outline" onClick={onMicrophone}>
            <Mic />
            Microphone
          </Button>
          <FilePicker accept="audio/*" onPick={onRecording}>
            <FileAudio />
            Recording
          </FilePicker>
        </ButtonGroup>
      )}
    </div>
  );
}

export function NoteStepper({
  label,
  note,
  count,
  onMove,
}: {
  label: string;
  note: number;
  count: number;
  onMove: (note: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Hint label="Previous note">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous note"
          onClick={() => onMove(note - 1)}
        >
          <ChevronLeft />
        </Button>
      </Hint>
      <span className="min-w-24 text-center tabular-nums">
        {label} {note + 1}
        {count > 0 && ` of ${count}`}
      </span>
      <Hint label="Next note">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next note"
          onClick={() => onMove(note + 1)}
        >
          <ChevronRight />
        </Button>
      </Hint>
    </div>
  );
}

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
    <div className="flex items-center gap-3">
      <span className="flex min-w-16 items-center justify-end gap-1 whitespace-nowrap tabular-nums">
        <Beat quarters={beat} />= {tempo}
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
      <Hint label={ticking ? "Stop the metronome" : "Start the metronome"}>
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
      </Hint>
    </div>
  );
}

export function ConditionPicker({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (condition: number) => void;
}) {
  const items = conditions.map((condition, index) => ({
    value: index,
    label: `${index + 1}. ${condition.name}`,
  }));

  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(condition) => condition !== null && onChange(condition)}
    >
      <SelectTrigger aria-label="Condition" className="w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ReferencePicker({
  hz,
  disabled,
  onChange,
}: {
  hz: number;
  disabled: boolean;
  onChange: (hz: number) => void;
}) {
  const items = settings.referenceChoices.map((choice) => ({
    value: choice,
    label: `A4 = ${choice} Hz`,
  }));

  return (
    <Select
      items={items}
      value={hz}
      disabled={disabled}
      onValueChange={(choice) => choice !== null && onChange(choice)}
    >
      <SelectTrigger aria-label="Reference pitch">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// A button that opens the file picker. With a label it shows only its icon, and the label as a
// tooltip.
function FilePicker({
  label,
  accept,
  disabled,
  onPick,
  children,
}: {
  label?: string;
  accept: string;
  disabled?: boolean;
  onPick: (file: File) => void;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) onPick(file);
    event.target.value = "";
  }

  const button = (
    <Button
      variant={label ? "ghost" : "outline"}
      size={label ? "icon" : "default"}
      aria-label={label}
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
    >
      {children}
    </Button>
  );

  return (
    <>
      {label ? <Hint label={label}>{button}</Hint> : button}
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept={accept}
        onChange={onChange}
      />
    </>
  );
}

function Hint({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function caption(score: (typeof scores)[number]) {
  return `${score.title} (${score.composer})`;
}

// The note a beat lasts, drawn rather than typed: most fonts lack the half note's character, and
// a dotted note is two characters that fonts space apart.
function Beat({ quarters }: { quarters: number }) {
  const label = { 1: "Quarter note", 1.5: "Dotted quarter note", 2: "Half note" }[quarters];

  return (
    <svg viewBox="0 0 14 24" className="h-5 w-3" role="img" aria-label={label}>
      <ellipse
        cx="5"
        cy="19"
        rx="4"
        ry="3"
        transform="rotate(-20 5 19)"
        fill={quarters === 2 ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="8.5" y1="18" x2="8.5" y2="2" stroke="currentColor" strokeWidth="1.5" />
      {quarters === 1.5 && <circle cx="12.5" cy="19" r="1.3" fill="currentColor" />}
    </svg>
  );
}
