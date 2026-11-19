"use client";

import { useEffect, useEffectEvent, useRef, type MouseEvent } from "react";
import type {
  OpenSheetMusicDisplay,
  VexFlowGraphicalNote,
} from "opensheetmusicdisplay";
import { apply, type Condition } from "@/lib/score/conditions";
import { read, type Sheet } from "@/lib/score/read";
import settings from "@/settings";

// Draws a MusicXML score for one condition, with notes `spacing` times wider in the simplified
// layout, keeps its cursor on `note`, and colors the notes in `marks`. Reports the score's notes once it is drawn, and which note a click lands on.
export default function Score({
  content,
  condition,
  spacing,
  note,
  marks,
  onLoad,
  onPick,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<typeof import("opensheetmusicdisplay")>(undefined);
  const osmdRef = useRef<OpenSheetMusicDisplay>(undefined);
  const sheetRef = useRef<Sheet>(undefined);
  const stepRef = useRef(0);
  const paintedRef = useRef<SVGElement[]>([]);

  const onContent = useEffectEvent(load);
  const onCondition = useEffectEvent(draw);
  const onNote = useEffectEvent(place);
  const onMarks = useEffectEvent(paint);

  useEffect(() => {
    if (content) void onContent(content);
  }, [content]);

  useEffect(() => onCondition(), [condition, spacing]);
  useEffect(() => onNote(note), [note]);
  // OSMD redraws the page itself when the window is resized, which drops the colors, so they
  // are put back as the cursor moves too.
  useEffect(() => onMarks(), [marks, note]);

  async function load(content: string | Blob) {
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
      onLoad(sheetRef.current!);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  // Renders the loaded score for the current condition and puts the cursor back.
  function draw() {
    const osmd = osmdRef.current;
    const library = libraryRef.current;

    if (!osmd || !library || !osmd.Sheet) return;

    apply(osmd, condition, library.EngravingRules, spacing);
    osmd.render();
    sheetRef.current ??= read(osmd);
    osmd.cursor.reset();
    stepRef.current = 0;
    place(note);

    if (condition.cursor) osmd.cursor.show();
    else osmd.cursor.hide();

    paint();
  }

  // Colors the marked notes. A note inside a repeat is printed once, so a mark on either time
  // through colors it.
  function paint() {
    const osmd = osmdRef.current;
    const sheet = sheetRef.current;

    for (const element of paintedRef.current) {
      element.style.fill = "";
      element.style.stroke = "";
    }
    paintedRef.current = [];

    if (!osmd || !sheet) return;

    for (const marked of marks) {
      for (const printed of sheet.places[marked]?.printed ?? []) {
        const graphical = osmd.EngravingRules.GNote(printed) as VexFlowGraphicalNote | undefined;
        const group = graphical?.getSVGGElement();

        for (const element of group?.querySelectorAll("path") ?? []) {
          element.style.fill = settings.feedback.color;
          element.style.stroke = settings.feedback.color;
          paintedRef.current.push(element);
        }
      }
    }
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

  function onClick(event: MouseEvent) {
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

    // A note inside a repeat has a place each time it is played; take the nearest to the cursor.
    const picked = sheet.places
      .map((place, index) => ({ index, place }))
      .toSorted(
        (a, b) =>
          Math.abs(a.place.written - written) -
            Math.abs(b.place.written - written) ||
          Math.abs(a.index - note) - Math.abs(b.index - note),
      )[0].index;

    onPick(picked);
  }

  // Clicking a note is a shortcut for the pointer. The keyboard does the same with the arrow
  // keys and the toolbar's previous and next buttons, so the score itself takes no keys.
  return (
    // react-doctor-disable-next-line click-events-have-key-events, no-noninteractive-element-interactions
    <main
      ref={containerRef}
      className="min-h-0 flex-1 cursor-pointer overflow-auto p-2"
      style={{
        background: condition.contrast ? settings.contrast.page : "#ffffff",
      }}
      title="Click a note to start from its measure, or, while following, to put the cursor there. The arrow keys move one note."
      onClick={onClick}
    />
  );
}

interface Props {
  content?: string | Blob;
  condition: Condition;
  spacing: number;
  note: number;
  marks: ReadonlySet<number>;
  onLoad: (sheet: Sheet) => void;
  onPick: (note: number) => void;
  onError: (message: string) => void;
}
