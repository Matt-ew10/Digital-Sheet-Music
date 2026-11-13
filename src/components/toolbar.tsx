"use client";

import type { ChangeEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileAudio,
  FolderOpen,
  Mic,
  Square,
} from "lucide-react";
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

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) onOpen(file);
    event.target.value = "";
  }

  return (
    <div className="flex items-center gap-1">
      <select
        className={control}
        aria-label="Score"
        value={chosen ?? ""}
        disabled={disabled}
        onChange={(event) => onChoose(event.target.value)}
      >
        {opened && !chosen && <option value="">{opened}</option>}
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {scores
              .filter((score) => score.group === group)
              .map((score) => (
                <option key={score.file} value={score.file}>
                  {score.title} ({score.composer})
                </option>
              ))}
          </optgroup>
        ))}
      </select>

      <label className={icon} title="Open a MusicXML file">
        <FolderOpen size={18} aria-label="Open a MusicXML file" />
        <input
          className="hidden"
          type="file"
          accept=".musicxml,.xml,.mxl"
          disabled={disabled}
          onChange={onChange}
        />
      </label>
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
  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) onRecording(file);
    event.target.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500">Follow</span>

      {source !== undefined ? (
        <button className={`${segment} rounded-full`} onClick={onStop}>
          <Square size={14} fill="currentColor" />
          Stop
          <span className="max-w-40 truncate text-zinc-500">{source}</span>
        </button>
      ) : (
        <div className="flex">
          <button className={`${segment} rounded-l-full`} onClick={onMicrophone}>
            <Mic size={16} />
            Microphone
          </button>
          <label className={`${segment} -ml-px rounded-r-full`}>
            <FileAudio size={16} />
            Recording
            <input
              className="hidden"
              type="file"
              accept="audio/*"
              onChange={onChange}
            />
          </label>
        </div>
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
      <button
        className={icon}
        aria-label="Previous note"
        onClick={() => onMove(note - 1)}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="min-w-24 text-center tabular-nums">
        {label} {note + 1}
        {count > 0 && ` of ${count}`}
      </span>
      <button
        className={icon}
        aria-label="Next note"
        onClick={() => onMove(note + 1)}
      >
        <ChevronRight size={18} />
      </button>
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
  return (
    <select
      className={control}
      aria-label="Condition"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {conditions.map((option, index) => (
        <option key={option.name} value={index}>
          {index + 1}. {option.name}
        </option>
      ))}
    </select>
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
  return (
    <select
      className={control}
      value={hz}
      disabled={disabled}
      aria-label="Reference pitch"
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {settings.referenceChoices.map((choice) => (
        <option key={choice} value={choice}>
          A4 = {choice} Hz
        </option>
      ))}
    </select>
  );
}

const control =
  "h-9 cursor-pointer rounded-full border border-zinc-300 bg-transparent px-3 hover:bg-zinc-100 disabled:cursor-default disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";
const icon =
  "flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900";
const segment =
  "flex h-9 cursor-pointer items-center gap-2 border border-zinc-300 px-4 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";
