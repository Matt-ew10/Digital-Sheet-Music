"use client";

import { useEffect, useRef, useState } from "react";
import { listen } from "@/lib/audio/listen";
import type { follower } from "@/lib/score/follow";

// Feeds one audio source at a time to a score follower: the source's name while it plays, and
// the note the follower puts the player on (-1 before the first).
export function useListening() {
  const stopRef = useRef<() => void>(undefined);
  const followRef = useRef<ReturnType<typeof follower>>(undefined);
  const [source, setSource] = useState<string>();
  const [position, setPosition] = useState(-1);

  useEffect(() => () => stopRef.current?.(), []);

  async function start(
    open: Parameters<typeof listen>[0],
    name: string,
    follow: ReturnType<typeof follower>,
  ) {
    stop();

    stopRef.current = await listen(open, (reading, time) => {
      setPosition(follow.read(time, reading?.hz));
    });
    followRef.current = follow;
    setSource(name);
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = undefined;
    followRef.current = undefined;
    setSource(undefined);
    setPosition(-1);
  }

  // The person running the session says the player is on `note`.
  function seek(note: number) {
    if (!followRef.current) return;

    followRef.current.seek(note);
    setPosition(note);
  }

  return { source, position, start, stop, seek };
}
