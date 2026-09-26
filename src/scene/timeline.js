// The opening sequence.
//
// One clock drives everything, and the beats deliberately OVERLAP: the letters
// are still resolving when the welcome strip drops, the chips are still sliding
// when the people inside the G and the H begin to surface. That overlap is the
// difference between a title sequence and a queue of fades.
//
//   0.0  black
//   2.1  PRAJWAL materialises, centre letters first
//   2.9  WELCOME TO MY WORLD drops from above and overshoots
//   3.2  the chips arrive from the left and the right
//   3.5  arrows and the corner dot grid tick into place
//   4.0  the header draws itself in
//   5.7  settled - ambient life and pointer parallax take over

import {
  clamp, span, lerp, easeOutCubic, easeOutExpo, smoothstep,
} from '../lib/ease.js';

export const T = {
  letters: 0.18,
  letterStagger: 0.08,
  letterDur: 1.25,
  ember: 0.35,
  welcome: 0.95,
  artist: 1.15,
  legend: 1.25,
  arrows: 1.40,
  dots: 1.55,
  header: 1.95,
  settled: 3.10,
};

/** Reveal order: centre outward, so the wordmark grows from the middle. */
export function letterOrder(letters) {
  return letters
    .map((l, i) => ({ i, d: Math.abs((l.u0 + l.u1) / 2 - 0.5) }))
    .sort((a, b) => a.d - b.d)
    .map((x, rank) => ({ i: x.i, rank }))
    .reduce((acc, x) => { acc[x.i] = x.rank; return acc; }, []);
}

export function sample(t, nLetters, order) {
  // ---- letters ----------------------------------------------------------
  const letters = [];
  for (let i = 0; i < nLetters; i++) {
    const t0 = T.letters + order[i] * T.letterStagger;
    const p = span(t, t0, t0 + T.letterDur);
    const e = easeOutExpo(p);
    letters.push({
      // dissolve resolves slightly ahead of the transform settling
      reveal: span(t, t0, t0 + T.letterDur * 0.82),
      opacity: smoothstep(0, 0.18, p),
      dy: lerp(0.34, 0, e),                       // rises into place
      soften: lerp(1, 0, easeOutCubic(clamp(p * 1.15))),
      edge: smoothstep(0.35, 1, p),
    });
  }

  // ---- atmosphere -------------------------------------------------------
  const ember = smoothstep(0, 1, span(t, T.ember, T.ember + 2.2));
  // a single soft pulse as the wordmark lands: light, not a strobe
  const flash = Math.max(
    0.17 * bell(span(t, T.letters + 0.25, T.letters + 1.25)),
    0.10 * bell(span(t, T.welcome, T.welcome + 0.5)),
  );
  const grain = lerp(0.075, 0.034, smoothstep(0, 1, span(t, 0.2, 3.2)));

  return {
    letters, ember, flash, grain,
    settled: t >= T.settled,
    progress: clamp(t / T.settled),
  };
}

function bell(p) {
  if (p <= 0 || p >= 1) return 0;
  return Math.sin(p * Math.PI) ** 2;
}

/** DOM cues: [time, name]. main.js flips a class on each. */
export const CUES = [
  [T.letters, 'hero'],
  [T.welcome, 'welcome'],
  [T.artist, 'artist'],
  [T.legend, 'legend'],
  [T.arrows, 'arrows'],
  [T.dots, 'dots'],
  [T.header, 'header'],
  [T.settled, 'settled'],
];
