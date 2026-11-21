import type {
  EngravingRules,
  OpenSheetMusicDisplay,
} from "opensheetmusicdisplay";
import settings from "@/settings";

// The ways the experiment shows a score (Table 1 of the research plan).
export const conditions = [
  { name: "Standard score", cursor: false, tint: false, spacing: false, feedback: false },
  { name: "Position tracking", cursor: true, tint: false, spacing: false, feedback: false },
  { name: "Colored background", cursor: false, tint: true, spacing: false, feedback: false },
  { name: "Simplified layout", cursor: false, tint: false, spacing: true, feedback: false },
  { name: "Pitch feedback", cursor: false, tint: false, spacing: false, feedback: true },
];

// Sets OSMD up to draw `condition`, starting from OSMD's defaults so that nothing carries over
// from the condition drawn before. Takes effect at the next render. OSMD's classes come in as
// `Rules` because OSMD can only be loaded in the browser. The person running the session chooses
// how many times wider notes are spaced in the simplified layout (`look.notes`) and the page
// color in condition 3 (`look.tint`).
export function apply(
  osmd: OpenSheetMusicDisplay,
  condition: Condition,
  Rules: typeof EngravingRules,
  look: { notes: number; tint: string },
) {
  const defaults = new Rules();
  const rules = osmd.EngravingRules;
  const factor = condition.spacing ? look.notes : 1;

  osmd.setOptions({ pageBackgroundColor: page(condition, look.tint) });

  rules.VoiceSpacingMultiplierVexflow =
    defaults.VoiceSpacingMultiplierVexflow * factor;
  rules.VoiceSpacingAddendVexflow = defaults.VoiceSpacingAddendVexflow * factor;
  // Measure numbers in the middle of a line look like the fingerings printed above the notes.
  rules.RenderMeasureNumbersOnlyAtSystemStart = true;
  rules.MinimumDistanceBetweenSystems =
    defaults.MinimumDistanceBetweenSystems *
    (condition.spacing ? settings.spacing.lines : 1);
}

// The color of the page behind the score.
export function page(condition: Condition, tint: string) {
  return condition.tint ? tint : "#ffffff";
}

export type Condition = (typeof conditions)[number];
