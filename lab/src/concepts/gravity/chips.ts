// What falls. Every piece of text on a pill comes straight from content.ts.

import { person, projects } from '../../content'
import type { ItemSpec, Tone } from './scene'

/** Topic tags, deduplicated, taken round-robin so every project is represented early. */
export function topicList(): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const depth = Math.max(...projects.map((p) => p.topics.length))
  for (let i = 0; i < depth; i++) {
    for (const p of projects) {
      const t = p.topics[i]
      if (t && !seen.has(t)) {
        seen.add(t)
        out.push(t)
      }
    }
  }
  return out
}

// One flat colour per discipline, cycled if there are ever more than four.
export const DISCIPLINE_TONES: readonly Tone[] = ['cobalt', 'tomato', 'marigold', 'ink']
export const disciplineTone = (i: number): Tone => DISCIPLINE_TONES[i % DISCIPLINE_TONES.length]

// No ink here: an ink pill wedged against the ink name would read as part of a letter.
const TOPIC_TONES: readonly Tone[] = ['paper', 'sand', 'paper', 'cobalt', 'paper', 'marigold', 'paper', 'sand', 'tomato', 'paper']

const HERO_SHAPES: readonly ItemSpec[] = [
  { shape: 'circle', tone: 'cobalt', size: 66 },
  { shape: 'half', tone: 'tomato', size: 108 },
  { shape: 'square', tone: 'marigold', size: 58 },
  { shape: 'ring', tone: 'cobalt', size: 80 },
  { shape: 'circle', tone: 'cobalt', size: 40 },
  { shape: 'quarter', tone: 'tomato', size: 64 },
  { shape: 'circle', tone: 'sand', size: 52 },
  { shape: 'half', tone: 'marigold', size: 76 },
  { shape: 'square', tone: 'cobalt', size: 42 },
  { shape: 'ring', tone: 'tomato', size: 56 },
  { shape: 'circle', tone: 'paper', size: 46 },
  { shape: 'quarter', tone: 'cobalt', size: 56 },
  { shape: 'circle', tone: 'tomato', size: 36 },
  { shape: 'square', tone: 'sand', size: 50 },
  { shape: 'half', tone: 'cobalt', size: 88 },
  { shape: 'ring', tone: 'marigold', size: 62 },
]

export interface HeroSpecs {
  /** Role and disciplines: always present. Released last so they land on top. */
  lead: ItemSpec[]
  /** Topics and plain shapes in priority order; trimmed to the area budget. */
  rest: ItemSpec[]
}

export function heroSpecs(width: number): HeroSpecs {
  const k = Math.min(1.6, Math.max(0.58, width / 1440))
  const maxTopics = width < 700 ? 13 : 24
  const maxShapes = width < 700 ? 7 : HERO_SHAPES.length

  const lead: ItemSpec[] = [
    ...person.disciplines.map(
      (text, i): ItemSpec => ({ shape: 'pill', tone: disciplineTone(i), text, variant: 'discipline', big: true }),
    ),
    // Outlined, so it reads apart from the ink discipline pill and the ink name.
    { shape: 'pill', tone: 'paper', text: person.role, variant: 'role', big: true },
  ]

  const topics = topicList()
    .slice(0, maxTopics)
    .map((text, i): ItemSpec => ({ shape: 'pill', tone: TOPIC_TONES[i % TOPIC_TONES.length], text }))
  const shapes = HERO_SHAPES.slice(0, maxShapes).map((s): ItemSpec => ({ ...s, size: (s.size ?? 50) * k }))

  // Two topics, then a shape, and so on.
  const rest: ItemSpec[] = []
  let t = 0
  let s = 0
  while (t < topics.length || s < shapes.length) {
    if (t < topics.length) rest.push(topics[t++])
    if (t < topics.length) rest.push(topics[t++])
    if (s < shapes.length) rest.push(shapes[s++])
  }
  return { lead, rest }
}

// Never ink or cobalt here: a shape resting on a link pill of its own colour
// would read as a lump on the pill.
const CONTACT_SHAPES: readonly ItemSpec[] = [
  { shape: 'circle', tone: 'marigold', size: 96 },
  { shape: 'half', tone: 'tomato', size: 150 },
  { shape: 'square', tone: 'paper', size: 78 },
  { shape: 'ring', tone: 'tomato', size: 104 },
  { shape: 'circle', tone: 'sand', size: 54 },
  { shape: 'quarter', tone: 'marigold', size: 92 },
  { shape: 'circle', tone: 'tomato', size: 70 },
  { shape: 'half', tone: 'marigold', size: 104 },
  { shape: 'square', tone: 'tomato', size: 60 },
  { shape: 'ring', tone: 'marigold', size: 72 },
  { shape: 'circle', tone: 'paper', size: 44 },
  { shape: 'quarter', tone: 'sand', size: 66 },
  { shape: 'square', tone: 'marigold', size: 46 },
  { shape: 'circle', tone: 'paper', size: 58 },
  { shape: 'half', tone: 'sand', size: 84 },
  { shape: 'circle', tone: 'tomato', size: 80 },
]

export function contactSpecs(width: number): ItemSpec[] {
  const k = Math.min(1.5, Math.max(0.5, width / 1440))
  const n = width < 700 ? 9 : width < 1100 ? 12 : CONTACT_SHAPES.length
  return CONTACT_SHAPES.slice(0, n).map((s) => ({ ...s, size: (s.size ?? 60) * k }))
}
