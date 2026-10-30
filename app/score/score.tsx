"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { listen, microphone, recording } from "@/app/audio/listen";
import settings from "@/settings";
import { apply, conditions } from "./conditions";
import { follower } from "./follow";
import { read } from "./sheet";

export default function Score() {
  const containerRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<typeof import("opensheetmusicdisplay")>(undefined);
  const osmdRef = useRef<OpenSheetMusicDisplay>(undefined);
  const sheetRef = useRef<ReturnType<typeof read>>(undefined);
  const followRef = useRef<ReturnType<typeof follower>>(undefined);
  const stepRef = useRef(0);
  const stopRef = useRef<() => void>(undefined);
  const [title, setTitle] = useState<string>();
  const [count, setCount] = useState(0);
  const [condition, setCondition] = useState(1);
  const [from, setFrom] = useState(0);
  const [position, setPosition] = useState(-1);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();

  // The cursor waits on the note playing starts from until the player gets there.
  const shown = Math.max(position, from);

  const onSample = useEffectEvent(open);
  const onCondition = useEffectEvent(draw);
  const onShown = useEffectEvent(place);
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") move(shown - 1);
    if (event.key === "ArrowRight") move(shown + 1);
  });

  // The sample sits next to this page, so a relative URL also works under GitHub Pages' path.
  useEffect(() => {
    fetch("sample.musicxml")
      .then((response) => response.text())
      .then(onSample)
      .catch((cause) => setError(String(cause)));

    return () => stopRef.current?.();
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => onCondition(), [condition]);
  useEffect(() => onShown(shown), [shown]);

  async function open(content: string | Blob) {
    stop();
    setError(undefined);

    try {
      const library = (libraryRef.current ??=
        await import("opensheetmusicdisplay"));
      const osmd = (osmdRef.current ??= new library.OpenSheetMusicDisplay(
        containerRef.current!,
        { autoResize: true, followCursor: true, autoBeam: true },
      ));

      await osmd.load(content);
      sheetRef.current = undefined;
      draw();
      setTitle(osmd.Sheet.TitleString);
      setCount(sheetRef.current!.notes.length);
      setFrom(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  // Renders the loaded score for the current condition and puts the cursor back.
  function draw() {
    const osmd = osmdRef.current;
    const library = libraryRef.current;

    if (!osmd || !library || !osmd.Sheet) return;

    apply(osmd, conditions[condition], library.EngravingRules);
    osmd.render();
    sheetRef.current ??= read(osmd);
    osmd.cursor.reset();
    stepRef.current = 0;
    place(shown);

    if (conditions[condition].cursor) osmd.cursor.show();
    else osmd.cursor.hide();
  }

  async function start(source: Parameters<typeof listen>[0]) {
    const sheet = sheetRef.current;

    if (!sheet) return;

    stop();
    setError(undefined);

    const follow = follower(sheet.notes);

    follow.seek(from - 1);
    followRef.current = follow;

    try {
      stopRef.current = await listen(source, (reading, time) => {
        setPosition(follow.read(time, reading?.hz));
      });
      setListening(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = undefined;
    followRef.current = undefined;
    setListening(false);
    setPosition(-1);
  }

  // While listening, the person running the session corrects where the player is; otherwise
  // they choose where playing starts.
  function move(note: number) {
    if (note < 0 || note >= count) return;

    followRef.current?.seek(note);
    if (followRef.current) setPosition(note);
    setFrom(note);
  }

  // A click while listening corrects the cursor to the clicked note; otherwise playing will
  // start from the clicked note's measure.
  function onPick(event: MouseEvent) {
    const osmd = osmdRef.current;
    const library = libraryRef.current;
    const sheet = sheetRef.current;

    if (!osmd || !library || !sheet) return;

    const graphic = osmd.GraphicSheet;
    const point = graphic.svgToOsmd(
      graphic.domToSvg(new library.PointF2D(event.pageX, event.pageY)),
    );
    const entry = graphic.GetNearestVoiceEntry(point);

    if (!entry) return;

    const written = entry.parentStaffEntry.getAbsoluteTimestamp().RealValue;
    const { places } = sheet;

    // A note inside a repeat has a place each time it is played; take the nearest to the cursor.
    const note = places
      .map((place, index) => ({ index, place }))
      .toSorted(
        (a, b) =>
          Math.abs(a.place.written - written) -
            Math.abs(b.place.written - written) ||
          Math.abs(a.index - shown) - Math.abs(b.index - shown),
      )[0].index;

    if (listening) return move(note);

    let first = note;

    while (first > 0 && places[first - 1].measure === places[note].measure) {
      first--;
    }

    move(first);
  }

  // OSMD's cursor only steps forward, so moving back starts over from the beginning.
  function place(note: number) {
    const osmd = osmdRef.current;
    const sheet = sheetRef.current;

    if (!osmd || !sheet) return;

    const step = sheet.places[note]?.step ?? 0;

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

  const page = conditions[condition].contrast
    ? settings.contrast.page
    : "#ffffff";

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

        <select
          className={button}
          value={condition}
          disabled={listening}
          onChange={(event) => setCondition(Number(event.target.value))}
        >
          {conditions.map((option, index) => (
            <option key={option.name} value={index}>
              {index + 1}. {option.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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

        <button
          className={button}
          aria-label="Previous note"
          onClick={() => move(shown - 1)}
        >
          ◀
        </button>
        <button
          className={button}
          aria-label="Next note"
          onClick={() => move(shown + 1)}
        >
          ▶
        </button>

        <span className="text-sm text-zinc-500">
          {title && `${title}: `}
          {listening ? "note" : "starts at note"} {shown + 1}
          {count > 0 && ` of ${count}`}
        </span>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <p className="text-sm text-zinc-500">
        Click a note to start from its measure, or, while listening, to put the
        cursor there. The arrow keys move one note.
      </p>

      <div
        ref={containerRef}
        className="cursor-pointer rounded-lg p-2"
        style={{ background: page }}
        onClick={onPick}
      />
    </div>
  );
}

const button =
  "cursor-pointer rounded-full border border-zinc-300 px-5 py-2.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";
