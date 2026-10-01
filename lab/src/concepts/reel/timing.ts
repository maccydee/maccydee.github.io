// The film's edit decision list. Every value is a position on the master
// timeline in "film seconds". One film second is UNIT viewport heights of
// scroll, so scrolling is literally the playhead.

import { person, projects } from '../../content'

export const UNIT = 0.74
export const FPS = 24

export const STEP = 0.85 // one panel of horizontal travel
export const LEAD = 2 // reel panels before the projects: LinkedIn, then the open source title
export const EXTRA_BEAT = 1.3 // each discipline beyond the four choreographed ones

// Nothing below assumes a count: the film is as long as the lists in content.ts.
const EXTRA = Math.max(0, person.disciplines.length - 4)
const D_BASE = 10.1 // the fourth discipline has had its hold
const D_END = D_BASE + EXTRA * EXTRA_BEAT
const REEL = D_END + 1.5 // horizontal travel starts
const REEL_END = REEL + (projects.length + LEAD - 1) * STEP

// Running order: 01 Title, 02 Role, 03 Disciplines, 04 Work (LinkedIn, then GitHub and the repos), 05 Contact.
export const T = {
  thin: [0, 0.95], // title: the name drops to hairline
  lime: [0.3, 1.15], // the role, on a lime field, wipes up over the title
  invert: [1.8, 2.65], // a slanted edge inverts lime/ink
  bandsOut: [2.95, 3.4],
  d1: 3.4, // cut: discipline one
  dot: [4.2, 4.5], // the counter of the O fills
  zoom: [4.45, 5.2], // camera pushes through it
  d2: 5.2, // cut: discipline two (ultraviolet)
  d2Out: [6.3, 7.0],
  slats: [6.5, 7.15],
  d3: 7.15, // cut: discipline three
  win: [8.1, 8.95], // the stem of the I opens onto discipline four
  d4: 8.6, // its lines slide in from opposite sides
  extra: D_BASE, // further disciplines, if the list grows
  reelRise: [D_END, D_END + 0.8], // the reel wipes up, LinkedIn panel first
  seeIn: D_END + 0.6,
  reel: REEL,
  end: [REEL_END + 0.35, REEL_END + 1.15], // the last panel rests, then the shutters close
  total: REEL_END + 1.75,
} as const

export const pad2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0')

/** Playhead time as MM:SS:FF at 24 frames per film second. */
export function timecode(t: number) {
  const s = Math.floor(t + 1e-6)
  const f = Math.min(FPS - 1, Math.floor((t - s) * FPS + 1e-6))
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}:${pad2(f)}`
}

export const TOTAL_TC = timecode(T.total)
