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
import { useListening } from "@/hooks/use-listening";
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
  const [from, setFrom] = useState(0);
  const [error, setError] = useState<string>();
  const [referenceHz, setReferenceHz] = useReference();
  const session = useListening();

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
    session.stop();
    setError(undefined);
    setContent(score);
  }

  function onLoad(sheet: Sheet) {
    setSheet(sheet);
    setFrom(0);
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
    const follow = follower(sheet.notes, referenceHz, restarts);

    follow.wait(from);

    const judgement = conditions[condition].feedback
      ? judge(sheet.notes, referenceHz, settings.feedback)
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

      <Score
        content={content}
        condition={conditions[condition]}
        note={shown}
        marks={session.marks}
        onLoad={onLoad}
        onPick={onPick}
        onError={setError}
      />
    </div>
  );
}
