"use client";

import { useRef, useState, type ChangeEvent } from "react";
import settings from "@/settings";
import { listen, microphone, recording } from "./listen";
import { nearest } from "./note";
import { steady, type Reading } from "./pitch";

export default function Tuner() {
  const [listening, setListening] = useState(false);
  const [reading, setReading] = useState<Reading>();
  const [error, setError] = useState<string>();
  const stopRef = useRef<() => void>(undefined);
  const recentRef = useRef<Timed[]>([]);

  // Single frames jump with vibrato, bow noise, and room echo, so show a summary of recent ones.
  function onReading(reading?: Reading) {
    const now = performance.now();
    const recent = recentRef.current.filter(
      (timed) => now - timed.time < settings.smoothingMs,
    );

    if (reading) recent.push({ time: now, reading });
    recentRef.current = recent;

    if (recent.length === 0) return setReading(undefined);

    setReading({
      hz: steady(recent.map((timed) => timed.reading.hz)),
      clarity: recent[recent.length - 1].reading.clarity,
    });
  }

  async function start(open: Parameters<typeof listen>[0]) {
    stop();
    setError(undefined);

    try {
      stopRef.current = await listen(open, onReading);
      setListening(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = undefined;
    recentRef.current = [];
    setListening(false);
    setReading(undefined);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) void start(recording(file));
    event.target.value = "";
  }

  return (
    <div className="flex flex-col items-center gap-10">
      <Display reading={reading} />

      <div className="flex flex-wrap justify-center gap-3">
        {listening ? (
          <button className={button} onClick={stop}>
            Stop
          </button>
        ) : (
          <button className={button} onClick={() => start(microphone)}>
            Use microphone
          </button>
        )}

        <label className={button}>
          Play a recording
          <input
            className="hidden"
            type="file"
            accept="audio/*"
            onChange={onChange}
          />
        </label>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <p className="text-sm text-zinc-500">
        A4 = {settings.referenceHz} Hz. Change it in settings.ts.
      </p>
    </div>
  );
}

function Display({ reading }: { reading?: Reading }) {
  if (!reading) {
    return <div className="text-8xl font-semibold text-zinc-300">–</div>;
  }

  const note = nearest(reading.hz, settings.referenceHz);
  const offset = `${50 + note.cents}%`;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="text-8xl font-semibold">
        {note.name}
        <sub className="text-4xl font-normal">{note.octave}</sub>
      </div>

      <div className="relative h-3 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-500" />
        <div
          className="absolute top-1/2 size-5 -translate-1/2 rounded-full bg-foreground"
          style={{ left: offset }}
        />
      </div>

      <div className="flex gap-6 font-mono text-zinc-600 dark:text-zinc-400">
        <span>{note.cents > 0 ? `+${note.cents}` : note.cents} cents</span>
        <span>{reading.hz.toFixed(1)} Hz</span>
        <span>clarity {reading.clarity.toFixed(2)}</span>
      </div>
    </div>
  );
}

const button =
  "cursor-pointer rounded-full border border-zinc-300 px-5 py-2.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";

interface Timed {
  time: number;
  reading: Reading;
}
