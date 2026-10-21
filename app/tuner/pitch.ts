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

// `hzs` runs oldest to newest. The median of the newest five readings names the note now
// sounding, so a new note shows within three readings and octave errors shorter than that are
// outvoted. Averaging, in cents, the readings near that note finds the center of vibrato.
export function steady(hzs: number[]) {
  const anchor = median(hzs.slice(-5));
  const cents = hzs
    .map((hz) => 1200 * Math.log2(hz / anchor))
    .filter((offset) => Math.abs(offset) < 50);
  const mean = cents.reduce((sum, offset) => sum + offset, 0) / cents.length;

  return anchor * 2 ** (mean / 1200);
}

function median(values: number[]) {
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
}

export interface Reading {
  hz: number;
  clarity: number;
}
