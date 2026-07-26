import type { IntervalPlayMode } from '../settings'

/**
 * The Play Mode rows are identified by a small staff figure rather than text,
 * matching the reference design: two whole notes showing the shape of the
 * question.
 *
 * `step` is a staff position — 0 sits on the bottom line, each unit is half a
 * line spacing, so odd values land in the spaces.
 */

interface Notehead {
  column: number
  step: number
}

const LINES = 4
const LINE_GAP = 5
const TOP = 4
const COLUMN_GAP = 13
const LEFT = 10

function y(step: number): number {
  return TOP + (LINES - 1) * LINE_GAP - step * (LINE_GAP / 2)
}

function x(column: number): number {
  return LEFT + column * COLUMN_GAP
}

const LOW = 1
const HIGH = 4

const FIGURES: Record<IntervalPlayMode, Notehead[]> = {
  ascending: [
    { column: 0, step: LOW },
    { column: 1, step: HIGH },
  ],
  descending: [
    { column: 0, step: HIGH },
    { column: 1, step: LOW },
  ],
  harmonic: [
    { column: 0, step: LOW },
    { column: 0, step: HIGH },
  ],
  'ascending-harmonic': [
    { column: 0, step: LOW },
    { column: 1, step: HIGH },
    { column: 2, step: LOW },
    { column: 2, step: HIGH },
  ],
  'descending-harmonic': [
    { column: 0, step: HIGH },
    { column: 1, step: LOW },
    { column: 2, step: LOW },
    { column: 2, step: HIGH },
  ],
}

export function StaffFigure({ mode }: { mode: IntervalPlayMode }) {
  const noteheads = FIGURES[mode]
  const width = x(Math.max(...noteheads.map((n) => n.column))) + LEFT

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${TOP * 2 + (LINES - 1) * LINE_GAP}`}
      className="h-8"
      style={{ width: `${width * 2}px` }}
    >
      {Array.from({ length: LINES }, (_, i) => (
        <line
          key={i}
          x1={0}
          x2={width}
          y1={TOP + i * LINE_GAP}
          y2={TOP + i * LINE_GAP}
          stroke="currentColor"
          strokeWidth={0.6}
          opacity={0.7}
        />
      ))}
      {noteheads.map((note, i) => (
        <ellipse
          key={i}
          cx={x(note.column)}
          cy={y(note.step)}
          rx={2.9}
          ry={2.1}
          fill="currentColor"
          transform={`rotate(-20 ${x(note.column)} ${y(note.step)})`}
        />
      ))}
    </svg>
  )
}
