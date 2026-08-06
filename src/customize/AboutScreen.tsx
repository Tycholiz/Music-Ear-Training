import {
  bucketedSection,
  MIN_ATTEMPTS_TO_REPORT,
  type ExerciseAbout,
  type StatsView,
} from '../exercises'
import { RECENT_WINDOW } from '../settings'

/**
 * The manual for one exercise.
 *
 * Prose rather than a list of rows, because none of it is a control. It is the
 * one screen in the sheet a user reads instead of pressing, so it is set as
 * paragraphs under headings and left alone.
 *
 * ## What each exercise tracks is read, not written
 *
 * The statistics half lists the sections from that exercise's `StatsView` and
 * names its numbers from the constants the screen itself uses. Prose repeating
 * them would go stale the first time a breakdown was added or a threshold
 * changed, and nothing would fail — the manual would simply start lying, which
 * is worse than not having one.
 *
 * That is also why the numbers are interpolated rather than written out. Five
 * attempts and twenty are decisions made elsewhere; this screen is a reader of
 * them.
 */
export function AboutScreen({
  about,
  view,
}: {
  about: ExerciseAbout
  view: StatsView
}) {
  const bucketed = bucketedSection(view)
  const breakdowns = view.sections.filter((section) => !section.bucketed)

  return (
    <div className="flex flex-col gap-6 p-4">
      <Section title="What it asks">
        <p>{about.question}</p>
      </Section>

      <Section title="What it trains">
        {about.trains.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Section>

      <Section title="Working it">
        {about.working.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Section>

      {about.worthKnowing && about.worthKnowing.length > 0 && (
        <Section title="Worth knowing">
          {about.worthKnowing.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </Section>
      )}

      <Section title="What the statistics track">
        <p>
          The headline is <strong>{bucketed.title.toLowerCase()}</strong>,
          sorted into Needs work, Getting there and Solid.
        </p>
        {breakdowns.length > 0 && (
          <>
            <p>
              It also keeps{' '}
              {asList(breakdowns.map((section) => strip(section.title)))}.
            </p>
            <p>
              That split is the point. One figure covering every way a question
              can be asked is often true and useless at the same time — the same
              answer can be reliable one way round and hopeless the other, and
              an average across both describes neither. The extra measures are
              there to say which.
            </p>
          </>
        )}
      </Section>

      <Section title="Reading them">
        <p>
          Nothing is reported until you have answered it{' '}
          {MIN_ATTEMPTS_TO_REPORT} times recently. Two out of three is not 67%,
          and a figure you would act on should not be built on three attempts.
        </p>
        <p>
          Everything is measured over your last {RECENT_WINDOW} attempts at each
          item rather than over your whole history. So improvement shows up
          within a session or two, and a mistake you have stopped making stops
          being mentioned.
        </p>
        <p>
          <strong>The "often mistaken for" lines are the useful part.</strong>{' '}
          Knowing something is at 41% tells you to practise it, which you knew.
          Knowing you hear it as a minor triad tells you what to listen for.
        </p>
        <p>
          The buckets use the same measure that decides which questions come up
          more often, so whatever sits under Needs work is what the exercise
          will be asking you most.
        </p>
        <p>
          Swipe a row left to reset just that one — for when you have fixed
          something and want the record to start over rather than waiting for it
          to catch up.
        </p>
      </Section>
    </div>
  )
}

/**
 * A heading and its paragraphs.
 *
 * The same heading a statistics section uses, so the About screen sits in the
 * sheet's visual language without pretending its paragraphs are rows.
 */
function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-base font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 px-1 text-sm leading-relaxed text-content-muted">
        {children}
      </div>
    </section>
  )
}

/**
 * A section title, put back into a sentence.
 *
 * They are written as headings — "By play mode", "First chord recognition" —
 * and read as a list of things they need the leading "By" taken off.
 */
function strip(title: string): string {
  return title.replace(/^By /, '').toLowerCase()
}

/** "a, b and c" — an Oxford-comma-free list, since these are short. */
function asList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
