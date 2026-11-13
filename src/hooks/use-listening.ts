"use client";

import { useEffect, useRef, useState } from "react";
import { listen } from "@/lib/audio/listen";
import type { follower } from "@/lib/score/follow";
import type { judge } from "@/lib/score/judge";

// Feeds one audio source at a time to a score follower, and to a pitch judge when one is given:
// the source's name while it plays, the note the follower puts the player on (-1 before the
// first), and the notes the judge marks wrong.
export function useListening() {
  const stopRef = useRef<() => void>(undefined);
  const followRef = useRef<ReturnType<typeof follower>>(undefined);
  const [source, setSource] = useState<string>();
  const [position, setPosition] = useState(-1);
  const [marks, setMarks] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => () => stopRef.current?.(), []);

  async function start(
    open: Parameters<typeof listen>[0],
    name: string,
    follow: ReturnType<typeof follower>,
    judgement?: ReturnType<typeof judge>,
  ) {
    stop();

    // Corrections made while the microphone prompt is up or a recording is decoding still count.
    followRef.current = follow;

    try {
      stopRef.current = await listen(open, (reading, time) => {
        const position = follow.read(time, reading?.hz);

        setPosition(position);
        if (judgement?.read(time, reading?.hz, position)) setMarks(new Set(judgement.marks));
      });
    } catch (cause) {
      followRef.current = undefined;
      throw cause;
    }

    setSource(name);
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = undefined;
    followRef.current = undefined;
    setSource(undefined);
    setPosition(-1);
    setMarks(new Set());
  }

  // The person running the session says the player is on `note`.
  function seek(note: number) {
    if (!followRef.current) return;

    followRef.current.seek(note);
    setPosition(note);
  }

  return { source, position, marks, start, stop, seek };
}
