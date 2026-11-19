// Values the experiment team tunes by playing. Changing them needs no other code change.
const settings = {
  // Frequency of A4 the player tuned to, in Hz. The score page offers the choices; the default is
  // the one used until someone picks another. Participants tune to 442 before the experiment;
  // the student's practice recordings were made at 440. The two are 8 cents apart, a third of
  // condition 5's tolerance.
  referenceHz: 442,
  referenceChoices: [440, 442],

  // Readings quieter than this RMS level are treated as silence. 0 dB is the loudest possible
  // input. Played notes in the URMP recordings sit around -35 to -50.
  minVolumeDb: -60,

  // How clearly a reading must sound like one pitch (0 to 1). Lower values let noise through;
  // higher values miss low notes. On URMP, 0.8 read 5 to 13 points more viola and cello notes
  // correctly than 0.9.
  minClarity: 0.8,

  // Condition 5, pitch feedback: a note is right within `right` cents of its written pitch and
  // wrong beyond `wrong`. The research team set one tolerance of 25 cents; a `right` below
  // `wrong` would leave the notes between unjudged. A sound is judged after `attack` seconds of
  // bow attack and `hold` seconds held, and a new stroke counts as the next note once `strokes`
  // of the note's written length has passed. Wrong notes are drawn in `color`.
  feedback: {
    right: 25,
    wrong: 25,
    attack: 0.04,
    hold: 0.1,
    strokes: 0.8,
    color: "#dc2626",
  },

  // Condition 3, high contrast: colors of the notation and the page. The research plan asks for
  // more contrast with the same layout and size; how much more is the research team's call.
  contrast: { notation: "#ffffff", page: "#000000" },

  // Condition 4, simplified layout: how many times wider notes are spaced at first and how far
  // the person running the session can widen them, and how many times further apart the lines
  // are. The wider the notes, the fewer measures fit on a line: on the Gossec Gavotte, 3 gives
  // two measures a line and 5 gives one.
  spacing: { notes: 3, widest: 5, lines: 2 },
};

export default settings;
