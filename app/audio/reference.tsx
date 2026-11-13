"use client";

import { useSyncExternalStore } from "react";
import settings from "@/settings";

// The A4 the player tuned to, chosen on the page and remembered on this device, so the person
// running a session sets it once.
export function useReference() {
  const hz = useSyncExternalStore(subscribe, stored, () => settings.referenceHz);

  return [hz, choose] as const;
}

export function ReferencePicker({
  hz,
  onChange,
  disabled,
  className,
}: {
  hz: number;
  onChange: (hz: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      className={className}
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

const key = "referenceHz";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Storage can be unavailable (private browsing, blocked site data); the default then applies.
function stored() {
  try {
    const hz = Number(localStorage.getItem(key));
    if (settings.referenceChoices.includes(hz)) return hz;
  } catch {}

  return settings.referenceHz;
}

function choose(hz: number) {
  try {
    localStorage.setItem(key, String(hz));
  } catch {}

  listeners.forEach((listener) => listener());
}
