import { PitchDetector } from "pitchy";
import settings from "@/settings";

// Samples per reading. 2048 samples at 48 kHz hold nearly three periods of C2, the cello's
// lowest note, which pitch detection needs. Longer windows react later.
export const windowSize = 2048;

// Reads one window of samples. Quiet or unclear windows read as no pitch.
export function detector(sampleRate: number) {
  const pitchy = PitchDetector.forFloat32Array(windowSize);

  // pitchy's own minVolumeDecibels converts with 10^(dB/10), which is not dBFS for an amplitude.
  pitchy.minVolumeAbsolute = 10 ** (settings.minVolumeDb / 20);

  return (samples: Float32Array): Reading | undefined => {
    const [hz, clarity] = pitchy.findPitch(samples, sampleRate);

    return clarity >= settings.minClarity ? { hz, clarity } : undefined;
  };
}

export interface Reading {
  hz: number;
  clarity: number;
}
