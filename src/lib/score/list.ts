// The scores the app offers, in public/scores/. The excerpts are the experiment's passages:
// pitches and rhythms of public-domain works, without any edition's markings.
const scores: Score[] = [
  { file: "sample.musicxml", title: "Ode to Joy", composer: "Beethoven", group: "Sample" },

  { file: "violin/hunters-chorus.musicxml", title: "Hunters' Chorus", composer: "Weber", group: "Violin, beginner" },
  { file: "violin/long-long-ago.musicxml", title: "Long, Long Ago", composer: "Bayly", group: "Violin, beginner" },
  { file: "violin/lully-gavotte.musicxml", title: "Gavotte", composer: "Lully", group: "Violin, beginner" },
  { file: "violin/bach-minuet-no-1.musicxml", title: "Minuet No. 1", composer: "Bach", group: "Violin, beginner" },
  { file: "violin/bach-minuet-no-3.musicxml", title: "Minuet No. 3", composer: "Bach", group: "Violin, beginner" },

  { file: "violin/bach-bourree.musicxml", title: "Bourrée", composer: "Bach", group: "Violin, intermediate" },
  { file: "violin/becker-gavotte.musicxml", title: "Gavotte", composer: "Becker", group: "Violin, intermediate" },
  { file: "violin/humoresque.musicxml", title: "Humoresque", composer: "Dvořák", group: "Violin, intermediate" },
  { file: "violin/seitz-concerto-no-2.musicxml", title: "Concerto No. 2, 3rd movement", composer: "Seitz", group: "Violin, intermediate" },
  { file: "violin/seitz-concerto-no-5.musicxml", title: "Concerto No. 5, 1st movement", composer: "Seitz", group: "Violin, intermediate" },

  { file: "violin/bach-concerto-in-a-minor-1.musicxml", title: "Concerto in A minor, 1st movement", composer: "Bach", group: "Violin, advanced" },
  { file: "violin/bach-concerto-in-a-minor-3.musicxml", title: "Concerto in A minor, 3rd movement", composer: "Bach", group: "Violin, advanced" },
  { file: "violin/handel-sonata-no-4.musicxml", title: "Sonata No. 4", composer: "Handel", group: "Violin, advanced" },
  { file: "violin/veracini-sonata-in-e-minor.musicxml", title: "Sonata in E minor", composer: "Veracini", group: "Violin, advanced" },
  { file: "violin/vivaldi-concerto-in-g-minor.musicxml", title: "Concerto in G minor", composer: "Vivaldi", group: "Violin, advanced" },

  { file: "viola/handel-bourree.musicxml", title: "Bourrée", composer: "Handel", group: "Viola, beginner" },
  { file: "viola/hunters-chorus.musicxml", title: "Hunters' Chorus", composer: "Weber", group: "Viola, beginner" },
  { file: "viola/long-long-ago.musicxml", title: "Long, Long Ago", composer: "Bayly", group: "Viola, beginner" },
  { file: "viola/gossec-gavotte.musicxml", title: "Gavotte", composer: "Gossec", group: "Viola, beginner" },
  { file: "viola/brahms-waltz.musicxml", title: "Waltz", composer: "Brahms", group: "Viola, beginner" },

  { file: "viola/bach-bourree.musicxml", title: "Bourrée", composer: "Bach", group: "Viola, intermediate" },
  { file: "viola/bach-gavotte.musicxml", title: "Gavotte (Orchestral Suite No. 3)", composer: "Bach", group: "Viola, intermediate" },
  { file: "viola/bach-minuet-no-2.musicxml", title: "Minuet No. 2", composer: "Bach", group: "Viola, intermediate" },
  { file: "viola/becker-gavotte.musicxml", title: "Gavotte", composer: "Becker", group: "Viola, intermediate" },
  { file: "viola/humoresque.musicxml", title: "Humoresque", composer: "Dvořák", group: "Viola, intermediate" },
];

export default scores;

interface Score {
  file: string;
  title: string;
  composer: string;
  group: string;
}
