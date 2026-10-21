"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { listen, microphone, recording } from "@/app/audio/listen";
import { follower } from "./follow";
import { read } from "./sheet";

export default function Score() {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay>(undefined);
  const sheetRef = useRef<ReturnType<typeof read>>(undefined);
  const stepRef = useRef(0);
  const stopRef = useRef<() => void>(undefined);
  const [title, setTitle] = useState<string>();
  const [count, setCount] = useState(0);
  const [position, setPosition] = useState(-1);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();

  const onSample = useEffectEvent(open);

  // The sample sits next to this page, so a relative URL also works under GitHub Pages' path.
  useEffect(() => {
    fetch("sample.musicxml")
      .then((response) => response.text())
      .then(onSample)
      .catch((cause) => setError(String(cause)));

    return () => stopRef.current?.();
  }, []);

  async function open(content: string | Blob) {
    stop();
    setError(undefined);

    try {
      const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
      const osmd = (osmdRef.current ??= new OpenSheetMusicDisplay(
        containerRef.current!,
        { autoResize: true, followCursor: true },
      ));

      await osmd.load(content);
      osmd.render();
      sheetRef.current = read(osmd);
      stepRef.current = 0;
      osmd.cursor.show();
      setTitle(osmd.Sheet.TitleString);
      setCount(sheetRef.current.notes.length);
      setPosition(-1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function start(source: Parameters<typeof listen>[0]) {
    const sheet = sheetRef.current;

    if (!sheet) return;

    stop();
    setError(undefined);

    const follow = follower(sheet.notes);
    let shown = -1;

    try {
      stopRef.current = await listen(source, (reading, time) => {
        const next = follow(time, reading?.hz);

        if (next === shown) return;

        shown = next;
        place(next);
        setPosition(next);
      });
      setListening(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = undefined;
    setListening(false);
    place(-1);
    setPosition(-1);
  }

  // OSMD's cursor only steps forward, so moving back starts over from the beginning.
  function place(position: number) {
    const osmd = osmdRef.current;
    const sheet = sheetRef.current;

    if (!osmd || !sheet) return;

    const step = sheet.steps[position] ?? 0;

    if (step < stepRef.current) {
      osmd.cursor.reset();
      stepRef.current = 0;
    }

    while (stepRef.current < step) {
      osmd.cursor.next();
      stepRef.current++;
    }
  }

  function onScore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) void open(file);
    event.target.value = "";
  }

  function onRecording(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) void start(recording(file));
    event.target.value = "";
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className={button}>
          Open MusicXML
          <input
            className="hidden"
            type="file"
            accept=".musicxml,.xml,.mxl"
            onChange={onScore}
          />
        </label>

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
            onChange={onRecording}
          />
        </label>

        <span className="text-sm text-zinc-500">
          {title && `${title}: `}
          {position < 0 ? "waiting for the first note" : `note ${position + 1}`}
          {count > 0 && ` of ${count}`}
        </span>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <div ref={containerRef} className="rounded-lg bg-white p-2 text-black" />
    </div>
  );
}

const button =
  "cursor-pointer rounded-full border border-zinc-300 px-5 py-2.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";
