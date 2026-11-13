"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileAudio,
  FolderOpen,
  Mic,
  Square,
} from "lucide-react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { listen, microphone, recording } from "@/app/audio/listen";
import { ReferencePicker, useReference } from "@/app/audio/reference";
import settings from "@/settings";
import { apply, conditions } from "./conditions";
import { follower } from "./follow";
import scores from "./scores";
import { read } from "./sheet";

export default function Score() {
  const containerRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<typeof import("opensheetmusicdisplay")>(undefined);
  const osmdRef = useRef<OpenSheetMusicDisplay>(undefined);
  const sheetRef = useRef<ReturnType<typeof read>>(undefined);
  const followRef = useRef<ReturnType<typeof follower>>(undefined);
  const stepRef = useRef(0);
  const stopRef = useRef<() => void>(undefined);
  const [chosen, setChosen] = useState<string | undefined>(scores[0].file);
  const [opened, setOpened] = useState<string>();
  const [count, setCount] = useState(0);
  const [condition, setCondition] = useState(1);
  const [from, setFrom] = useState(0);
  const [position, setPosition] = useState(-1);
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<string>();
  const [referenceHz, setReferenceHz] = useReference();

  // The cursor waits on the note playing starts from until the player gets there.
  const shown = Math.max(position, from);
  const listening = source !== undefined;

  const onChosen = useEffectEvent(open);
  const onCondition = useEffectEvent(draw);
  const onShown = useEffectEvent(place);
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") move(shown - 1);
    if (event.key === "ArrowRight") move(shown + 1);
  });

  // Scores sit next to this page, so a relative URL also works under GitHub Pages' path.
  useEffect(() => {
    if (!chosen) return;

    fetch(`scores/${chosen}`)
      .then((response) => response.text())
      .then(onChosen)
      .catch((cause) => setError(String(cause)));
  }, [chosen]);

  useEffect(() => () => stopRef.current?.(), []);

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

  async function start(open: Parameters<typeof listen>[0], name: string) {
    const sheet = sheetRef.current;

    if (!sheet) return;

    stop();
    setError(undefined);

    // Playing may start again from the first note of any measure.
    const restarts = sheet.places.flatMap((place, index) =>
      index === 0 || place.measure !== sheet.places[index - 1].measure ? [index] : [],
    );
    const follow = follower(sheet.notes, referenceHz, restarts);

    follow.wait(from);
    followRef.current = follow;

    try {
      stopRef.current = await listen(open, (reading, time) => {
        setPosition(follow.read(time, reading?.hz));
      });
      setSource(name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = undefined;
    followRef.current = undefined;
    setSource(undefined);
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

    if (file) {
      setChosen(undefined);
      setOpened(file.name);
      void open(file);
    }
    event.target.value = "";
  }

  function onRecording(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) void start(recording(file), file.name);
    event.target.value = "";
  }

  const page = conditions[condition].contrast
    ? settings.contrast.page
    : "#ffffff";
  const groups = [...new Set(scores.map((score) => score.group))];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
        <div className="flex items-center gap-1">
          <select
            className={control}
            aria-label="Score"
            value={chosen ?? ""}
            disabled={listening}
            onChange={(event) => setChosen(event.target.value)}
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
              disabled={listening}
              onChange={onScore}
            />
          </label>
        </div>

        {/* One action, two sources: the cursor follows whatever it hears. */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">Follow</span>

          {listening ? (
            <button className={`${segment} rounded-full`} onClick={stop}>
              <Square size={14} fill="currentColor" />
              Stop
              <span className="max-w-40 truncate text-zinc-500">{source}</span>
            </button>
          ) : (
            <div className="flex">
              <button
                className={`${segment} rounded-l-full`}
                onClick={() => start(microphone, "Microphone")}
              >
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
                  onChange={onRecording}
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            className={icon}
            aria-label="Previous note"
            onClick={() => move(shown - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-24 text-center tabular-nums">
            {listening ? "Note" : "Start at"} {shown + 1}
            {count > 0 && ` of ${count}`}
          </span>
          <button
            className={icon}
            aria-label="Next note"
            onClick={() => move(shown + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select
            className={control}
            aria-label="Condition"
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

          <ReferencePicker
            className={control}
            hz={referenceHz}
            disabled={listening}
            onChange={setReferenceHz}
          />
        </div>

        {error && <p className="w-full text-red-600">{error}</p>}
      </header>

      <main
        ref={containerRef}
        className="min-h-0 flex-1 cursor-pointer overflow-auto p-2"
        style={{ background: page }}
        title="Click a note to start from its measure, or, while following, to put the cursor there. The arrow keys move one note."
        onClick={onPick}
      />
    </div>
  );
}

const control =
  "h-9 cursor-pointer rounded-full border border-zinc-300 bg-transparent px-3 hover:bg-zinc-100 disabled:cursor-default disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";
const icon =
  "flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900";
const segment =
  "flex h-9 cursor-pointer items-center gap-2 border border-zinc-300 px-4 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";
