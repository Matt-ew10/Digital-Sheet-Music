"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Score from "@/components/score";
import {
  ConditionPicker,
  FollowControls,
  NoteStepper,
  ReferencePicker,
  ScorePicker,
} from "@/components/toolbar";
import { SpacingControl, TempoControl, TintControl } from "@/components/panels";
import { useListening } from "@/hooks/use-listening";
import { useMetronome } from "@/hooks/use-metronome";
import { useReference } from "@/hooks/use-reference";
import { microphone, recording, type listen } from "@/lib/audio/listen";
import { conditions } from "@/lib/score/conditions";
import { follower } from "@/lib/score/follow";
import { judge } from "@/lib/score/judge";
import scores from "@/lib/score/list";
import type { Sheet } from "@/lib/score/read";
import settings from "@/settings";

export default function Home() {
  const [chosen, setChosen] = useState<string | undefined>(scores[0].file);
  const [opened, setOpened] = useState<string>();
  const [content, setContent] = useState<string | Blob>();
  const [sheet, setSheet] = useState<Sheet>();
  const [condition, setCondition] = useState(1);
  const [spacing, setSpacing] = useState(settings.spacing.notes);
  const [tint, setTint] = useState(settings.tint.colors[0].value);
  const [tempo, setTempo] = useState(100);
  const [from, setFrom] = useState(0);
  const [error, setError] = useState<string>();
  const [referenceHz, setReferenceHz] = useReference();
  const session = useListening();
  const metronome = useMetronome(tempo, sheet?.beat.perMeasure ?? 4);

  // The cursor waits on the note playing starts from until the player gets there.
  const shown = Math.max(session.position, from);
  const listening = session.source !== undefined;
  const count = sheet?.notes.length ?? 0;

  const onFetched = useEffectEvent(show);
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") move(shown - 1);
    if (event.key === "ArrowRight") move(shown + 1);
  });

  // Scores sit next to this page, so a relative URL also works under GitHub Pages' path. A score
  // picked while another is still loading replaces it.
  useEffect(() => {
    if (!chosen) return;

    const controller = new AbortController();

    fetch(`scores/${chosen}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load ${chosen}: HTTP ${response.status}`);
        }

        return response.text();
      })
      .then((score) => {
        if (!controller.signal.aborted) onFetched(score);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => controller.abort();
  }, [chosen]);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function show(score: string | Blob) {
    session.reset();
    metronome.stop();
    setError(undefined);
    setContent(score);
  }

  // A score starts at its printed tempo, in the beats a player counts.
  function onLoad(sheet: Sheet) {
    const { slowest, fastest } = settings.tempo;
    const printed = Math.round(sheet.tempo / sheet.beat.quarters);

    setSheet(sheet);
    setFrom(0);
    setTempo(Math.min(Math.max(printed, slowest), fastest));
  }

  function onOpen(file: File) {
    setChosen(undefined);
    setOpened(file.name);
    show(file);
  }

  async function start(open: Parameters<typeof listen>[0], name: string) {
    if (!sheet) return;

    setError(undefined);

    // Playing may start again from the first note of any measure.
    const restarts = sheet.places.flatMap((place, index) =>
      index === 0 || place.measure !== sheet.places[index - 1].measure ? [index] : [],
    );
    // Notes last as long as the chosen tempo makes them.
    const scale = sheet.tempo / (tempo * sheet.beat.quarters);
    const notes = sheet.notes.map((note) => ({ ...note, seconds: note.seconds * scale }));
    const follow = follower(notes, referenceHz, restarts);

    follow.wait(from);

    const judgement = conditions[condition].feedback
      ? judge(notes, referenceHz, { ...settings.feedback, metronome: metronome.ticking })
      : undefined;

    try {
      await session.start(open, name, follow, judgement);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  // While listening, the person running the session corrects where the player is; otherwise
  // they choose where playing starts.
  function move(note: number) {
    if (note < 0 || note >= count) return;

    session.seek(note);
    setFrom(note);
  }

  // A click while listening corrects the cursor to the clicked note; otherwise playing will
  // start from the clicked note's measure.
  function onPick(note: number) {
    if (!sheet) return;
    if (listening) return move(note);

    const { places } = sheet;
    let first = note;

    while (first > 0 && places[first - 1].measure === places[note].measure) {
      first--;
    }

    move(first);
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-2 text-sm">
        <ScorePicker
          chosen={chosen}
          opened={opened}
          disabled={listening}
          onChoose={setChosen}
          onOpen={onOpen}
        />

        <FollowControls
          source={session.source}
          onMicrophone={() => start(microphone, "Microphone")}
          onRecording={(file) => start(recording(file), file.name)}
          onStop={session.stop}
        />

        <NoteStepper
          label={listening ? "Note" : "Start at"}
          note={shown}
          count={count}
          onMove={move}
        />

        <div className="ml-auto flex items-center gap-2">
          <ConditionPicker
            value={condition}
            disabled={listening}
            onChange={setCondition}
          />
          <ReferencePicker
            hz={referenceHz}
            disabled={listening}
            onChange={setReferenceHz}
          />
        </div>

        {error && <p className="w-full text-destructive">{error}</p>}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <Score
          content={content}
          condition={conditions[condition]}
          spacing={spacing}
          tint={tint}
          note={shown}
          marks={conditions[condition].feedback ? session.marks : unmarked}
          onLoad={onLoad}
          onPick={onPick}
          onError={setError}
        />

        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-2 *:pointer-events-auto">
          <TempoControl
            tempo={tempo}
            beat={sheet?.beat.quarters ?? 1}
            locked={listening}
            ticking={metronome.ticking}
            held={listening && conditions[condition].feedback}
            onTempo={setTempo}
            onMetronome={metronome.toggle}
          />

          {conditions[condition].spacing && (
            <SpacingControl value={spacing} onChange={setSpacing} />
          )}
          {conditions[condition].tint && (
            <TintControl value={tint} onChange={setTint} />
          )}
        </div>
      </div>
    </div>
  );
}

const unmarked: ReadonlySet<number> = new Set();
