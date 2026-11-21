"use client";

import { useEffect, useRef, useState } from "react";
import { metronome } from "@/lib/audio/metronome";

// A metronome switched on and off by the person running the session, following `beatsPerMinute`
// while it runs. It starts inside the click that switches it on, which Safari requires for sound.
export function useMetronome(beatsPerMinute: number, perMeasure: number) {
  const metronomeRef = useRef<ReturnType<typeof metronome>>(undefined);
  const [ticking, setTicking] = useState(false);

  useEffect(() => metronomeRef.current?.set(beatsPerMinute), [beatsPerMinute]);
  useEffect(() => () => metronomeRef.current?.stop(), []);

  function toggle() {
    if (metronomeRef.current) return stop();

    metronomeRef.current = metronome(beatsPerMinute, perMeasure);
    setTicking(true);
  }

  function stop() {
    metronomeRef.current?.stop();
    metronomeRef.current = undefined;
    setTicking(false);
  }

  return { ticking, toggle, stop };
}
