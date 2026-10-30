import type {
  EngravingRules,
  OpenSheetMusicDisplay,
} from "opensheetmusicdisplay";
import settings from "@/settings";

// The ways the experiment shows a score (Table 1 of the research plan). Color-coded pitch
// feedback is not built yet.
export const conditions = [
  { name: "Standard score", cursor: false, contrast: false, spacing: false },
  { name: "Position tracking", cursor: true, contrast: false, spacing: false },
  { name: "High contrast", cursor: false, contrast: true, spacing: false },
  { name: "Simplified layout", cursor: false, contrast: false, spacing: true },
];

// Sets OSMD up to draw `condition`, starting from OSMD's defaults so that nothing carries over
// from the condition drawn before. Takes effect at the next render. OSMD's classes come in as
// `Rules` because OSMD can only be loaded in the browser.
export function apply(
  osmd: OpenSheetMusicDisplay,
  condition: Condition,
  Rules: typeof EngravingRules,
) {
  const defaults = new Rules();
  const rules = osmd.EngravingRules;
  const { contrast, spacing } = settings;

  osmd.setOptions({
    defaultColorMusic: condition.contrast ? contrast.notation : "#000000",
    pageBackgroundColor: condition.contrast ? contrast.page : "#ffffff",
  });

  const factor = condition.spacing ? spacing.notes : 1;

  rules.VoiceSpacingMultiplierVexflow =
    defaults.VoiceSpacingMultiplierVexflow * factor;
  rules.VoiceSpacingAddendVexflow = defaults.VoiceSpacingAddendVexflow * factor;
  rules.RenderXMeasuresPerLineAkaSystem = condition.spacing
    ? spacing.measuresPerLine
    : defaults.RenderXMeasuresPerLineAkaSystem;
  rules.MinimumDistanceBetweenSystems =
    defaults.MinimumDistanceBetweenSystems *
    (condition.spacing ? spacing.lines : 1);
}

export type Condition = (typeof conditions)[number];
