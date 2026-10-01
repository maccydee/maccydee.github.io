import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import type { Project } from '../../content'

export type CardTone = 'cobalt' | 'tomato' | 'marigold' | 'ink' | 'paper'

interface Props {
  project: Project
  index: number
  tone: CardTone
  /** Column position, used to stagger the entrance. */
  order: number
  /** Mouse-style pointer: enables tilt and drag. */
  fine: boolean
  reduce: boolean
}

const TILT = 7

export function ProjectCard({ project, index, tone, order, fine, reduce }: Props) {
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const rotateX = useSpring(rx, { stiffness: 260, damping: 16, mass: 0.6 })
  const rotateY = useSpring(ry, { stiffness: 260, damping: 16, mass: 0.6 })
  const dragged = useRef(false)
  const interactive = fine && !reduce

  const onMove = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    if (!interactive || e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    ry.set(px * TILT * 2)
    rx.set(-py * TILT * 2)
  }
  const onLeave = () => {
    rx.set(0)
    ry.set(0)
  }
  // A drag ends with a click on the same element; swallow that one.
  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (dragged.current) {
      e.preventDefault()
      dragged.current = false
    }
  }

  const tiltDir = index % 2 === 0 ? -1 : 1

  return (
    <motion.li
      className="grv-cell"
      initial={reduce ? false : { opacity: 0, y: 80, rotate: 5 * tiltDir, scale: 0.92 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{
        type: 'spring',
        stiffness: 190,
        damping: 11,
        mass: 0.9,
        delay: order * 0.09,
        opacity: { duration: 0.25, delay: order * 0.09 },
      }}
    >
      <motion.a
        className={`grv-card grv-card--${tone}`}
        href={project.url}
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        style={{ rotateX, rotateY, transformPerspective: 1000 }}
        drag={interactive}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.2}
        dragMomentum={false}
        dragTransition={{ bounceStiffness: 480, bounceDamping: 12 }}
        whileHover={interactive ? { scale: 1.025, y: -6 } : undefined}
        whileDrag={{ scale: 1.05, cursor: 'grabbing' }}
        whileTap={interactive ? undefined : { scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 380, damping: 15 }}
        onPointerDown={() => {
          dragged.current = false
        }}
        onDragStart={() => {
          dragged.current = true
        }}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onClick={onClick}
      >
        <span className="grv-card-top">
          <span className="grv-card-idx">
            {String(index + 1).padStart(2, '0')} <span aria-hidden="true">/</span> {project.lang}
          </span>
          <span className="grv-card-kind">{project.kind}</span>
        </span>
        <h3 className="grv-card-name">{project.name}</h3>
        <p className="grv-card-blurb">{project.blurb}</p>
        {project.figures.length > 0 && (
          <span className="grv-card-figs">
            {project.figures.map((f) => (
              <span key={f} className="grv-fig">
                {f}
              </span>
            ))}
          </span>
        )}
        <span className="grv-card-foot">
          <span className="grv-card-url">{project.url.replace(/^https?:\/\/(www\.)?github\.com\//, '')}</span>
          <span className="grv-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7" />
              <path d="M8.5 7H17v8.5" />
            </svg>
          </span>
        </span>
      </motion.a>
    </motion.li>
  )
}
