// Single source of truth for every concept. Copy is fixed: concepts import
// this and must not add facts, figures or claims of their own.
// Projects are exactly the six repos pinned on github.com/maccydee, in pinned
// order (checked 2026-10-01). Blurbs and figures come from the public repo
// descriptions. Never hardcode the count: use projects.length.

// THE STORY. Every design tells it in this order, top to bottom:
//   1. Callum            the name
//   2. Who is Callum     person.role (and the tagline)
//   3. What he does      person.disciplines
//   4. See what he does  first LinkedIn (see.linkedin), then GitHub and the repos (see.github, work, projects)
//   5. Where to contact  contact, links in order
// No LinkedIn or GitHub link appears above the disciplines.

export const person = {
  name: 'Callum McDonald',
  firstName: 'Callum',
  lastName: 'McDonald',
  role: 'Engineering Manager',
  tagline: 'Security detection, vulnerability management, AI enablement and agentic engineering.',
  // Never hardcode the count: use person.disciplines.length.
  disciplines: ['Security detection', 'Vulnerability management', 'AI enablement', 'Agentic engineering'],
  year: 2026,
} as const

// Order matters: LinkedIn is the primary link and comes first everywhere,
// and it must appear on the page above the GitHub link and the repo list.
export const links = [
  { label: 'LinkedIn', handle: '/in/callum-mcdonald', url: 'https://www.linkedin.com/in/callum-mcdonald-b416b299/' },
  { label: 'GitHub', handle: '@maccydee', url: 'https://github.com/maccydee' },
] as const

export const see = {
  linkedin: { label: 'Posts on LinkedIn', handle: '/in/callum-mcdonald', url: 'https://www.linkedin.com/in/callum-mcdonald-b416b299/' },
  github: { label: 'Shares on GitHub', handle: '@maccydee', url: 'https://github.com/maccydee' },
} as const

export const contact = { heading: 'Contact' } as const

export const work = {
  heading: 'Open source',
  note: 'Public on GitHub. Built through Claude Code. MIT licensed.',
} as const

export type Project = {
  name: string
  kind: string
  blurb: string
  figures: readonly string[] // real numbers from the repo description; may be empty
  lang: string
  topics: readonly string[]
  url: string
}

export const projects: readonly Project[] = [
  {
    name: 'claude-planning-skills',
    kind: 'Claude skills',
    blurb: 'Brainstorm a design, plan it, build it in reviewed batches, with a skeptic that questions scope at every gate.',
    figures: ['4 interlocking skills'],
    lang: 'Markdown',
    topics: ['claude-skill', 'planning', 'software-design', 'developer-tools'],
    url: 'https://github.com/maccydee/claude-planning-skills',
  },
  {
    name: 'job-radar',
    kind: 'CLI',
    blurb: "Watches employers' own job boards directly and only reports the roles that pass your filters, ranked against your CV.",
    figures: ['17,807 employer boards', '25 applicant tracking APIs'],
    lang: 'Python',
    topics: ['job-search', 'automation', 'self-hosted', 'sqlite'],
    url: 'https://github.com/maccydee/job-radar',
  },
  {
    name: 'rate-cv',
    kind: 'Claude skill',
    blurb: 'Scores and critiques CVs against a weighted engineering-leadership rubric, with ATS and AI-slop checks and optional job-description matching.',
    figures: [],
    lang: 'Python',
    topics: ['claude-skill', 'cv', 'hiring', 'ats'],
    url: 'https://github.com/maccydee/rate-cv',
  },
  {
    name: 'cute-web-scraper',
    kind: 'MCP server',
    blurb: 'A free, local MCP server that gives Claude web scraping powers. No API key.',
    figures: ['24 tools', '4 fetch tiers'],
    lang: 'Python',
    topics: ['mcp-server', 'web-scraping', 'playwright', 'browser-automation'],
    url: 'https://github.com/maccydee/cute-web-scraper',
  },
  {
    name: 'natural-writing',
    kind: 'Claude skill',
    blurb: 'For writing prose that reads as human, with a built-in self-test loop and a dependency-free slop detector.',
    figures: [],
    lang: 'Python',
    topics: ['writing', 'prose', 'ai-detection', 'claude-skill'],
    url: 'https://github.com/maccydee/natural-writing',
  },
  {
    name: 'scrub-transcripts',
    kind: 'Claude skill',
    blurb: "Finds passwords, API keys and tokens in Claude's local session logs and redacts them, without copying them into a new transcript.",
    figures: [],
    lang: 'Python',
    topics: ['secret-scanning', 'redaction', 'privacy', 'credentials'],
    url: 'https://github.com/maccydee/scrub-transcripts',
  },
]
