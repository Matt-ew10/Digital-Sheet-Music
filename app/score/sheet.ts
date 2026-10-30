import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { Note } from "./follow";

// The notes of the first part in the order the cursor visits them, and where each is on the
// page: the cursor step where it starts, its written position in whole notes, and its measure.
// Rests, grace notes, and tied continuations start nothing, so their time goes to the note
// before them. Leaves the cursor at the start.
export function read(osmd: OpenSheetMusicDisplay) {
  const { cursor } = osmd;
  const [instrument] = osmd.Sheet.Instruments;
  const starts: ({ pitches: number[]; at: number } & Place)[] = [];
  let at = 0;
  let whole = 0;
  let bpm = cursor.Iterator.CurrentBpm;

  cursor.reset();

  for (let step = 0; !cursor.Iterator.EndReached; step++) {
    const { CurrentEnrolledTimestamp: timestamp, CurrentBpm } = cursor.Iterator;

    // A whole note lasts four beats; the tempo is in quarter-note beats per minute.
    at += ((timestamp.RealValue - whole) * 240) / bpm;
    whole = timestamp.RealValue;
    bpm = CurrentBpm;

    const sounding = cursor
      .NotesUnderCursor(instrument)
      .filter(
        (note) =>
          !note.isRest() &&
          !note.ParentVoiceEntry.IsGrace &&
          (!note.NoteTie || note.NoteTie.StartNote === note),
      );

    if (sounding.length > 0) {
      starts.push({
        // OSMD counts half tones from C0 an octave below MIDI's.
        pitches: [...new Set(sounding.map((note) => note.halfTone + 12))],
        at,
        step,
        written: cursor.Iterator.CurrentSourceTimestamp.RealValue,
        measure: cursor.Iterator.CurrentMeasureIndex,
      });
    }

    cursor.next();
  }

  const end =
    at + ((osmd.Sheet.SheetEndTimestamp.RealValue - whole) * 240) / bpm;

  cursor.reset();

  return {
    notes: starts.map(({ pitches, at }, index): Note => ({
      pitches: pitches.toSorted((a, b) => a - b),
      seconds: (starts[index + 1]?.at ?? end) - at,
    })),
    places: starts.map(({ step, written, measure }): Place => ({
      step,
      written,
      measure,
    })),
  };
}

// Where a note is on the page. A note inside a repeat has one place per time it is played.
export interface Place {
  step: number;
  written: number;
  measure: number;
}
