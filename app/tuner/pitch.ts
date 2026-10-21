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

// The median drops outliers such as octave errors; averaging the rest, in cents,
// finds the center of vibrato, which the median alone swings around.
export function steady(hzs: number[]) {
  const median = hzs.toSorted((a, b) => a - b)[Math.floor(hzs.length / 2)];
  const cents = hzs
    .map((hz) => 1200 * Math.log2(hz / median))
    .filter((offset) => Math.abs(offset) < 50);
  const mean = cents.reduce((sum, offset) => sum + offset, 0) / cents.length;

  return median * 2 ** (mean / 1200);
}

export interface Reading {
  hz: number;
  clarity: number;
}
