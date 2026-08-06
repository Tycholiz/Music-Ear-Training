import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalSheet } from '../components'
import { chordSettingsStore, chordStatsStore } from '../settings'
import { AboutScreen } from './AboutScreen'
import { ChordSettingsMenu } from './ChordSettingsMenu'
import {
  CHORD_ABOUT,
  CHORD_STATS_VIEW,
  INTERVAL_ABOUT,
  INTERVAL_STATS_VIEW,
  MELODY_ABOUT,
  MELODY_STATS_VIEW,
  MIN_ATTEMPTS_TO_REPORT,
  PROGRESSION_ABOUT,
  PROGRESSION_STATS_VIEW,
  ROOT_ABOUT,
  ROOT_STATS_VIEW,
  bucketedSection,
  type ExerciseAbout,
  type StatsView,
} from '../exercises'
import { RECENT_WINDOW } from '../settings'

const EVERY_EXERCISE: [string, ExerciseAbout, StatsView][] = [
  ['intervals', INTERVAL_ABOUT, INTERVAL_STATS_VIEW],
  ['chords', CHORD_ABOUT, CHORD_STATS_VIEW],
  ['chord root', ROOT_ABOUT, ROOT_STATS_VIEW],
  ['melody', MELODY_ABOUT, MELODY_STATS_VIEW],
  ['progressions', PROGRESSION_ABOUT, PROGRESSION_STATS_VIEW],
]

describe('every exercise has one', () => {
  it('says what it asks, what it trains and how to work it', () => {
    for (const [name, about, view] of EVERY_EXERCISE) {
      const { unmount } = render(<AboutScreen about={about} view={view} />)

      expect(screen.getByText(about.question), name).toBeVisible()
      for (const line of [...about.trains, ...about.working]) {
        expect(screen.getByText(line), `${name}: ${line}`).toBeVisible()
      }
      unmount()
    }
  })

  it('leaves out the "worth knowing" heading when there is nothing to say', () => {
    const bare: ExerciseAbout = {
      question: 'Something sounds.',
      trains: ['A skill.'],
      working: ['Press a button.'],
    }
    render(<AboutScreen about={bare} view={INTERVAL_STATS_VIEW} />)

    expect(screen.queryByText('Worth knowing')).toBeNull()
  })
})

describe('reaching it from the menu', () => {
  it('sits between Statistics and Reset Score, in every exercise', async () => {
    // Right before Reset Score: the manual belongs with the things you read,
    // above the one destructive row rather than below it.
    const user = userEvent.setup()
    render(
      <ModalSheet open onClose={vi.fn()} title="Menu">
        <ChordSettingsMenu
          store={chordSettingsStore}
          statsStore={chordStatsStore}
          statsView={CHORD_STATS_VIEW}
          about={CHORD_ABOUT}
          onResetScore={vi.fn()}
        />
      </ModalSheet>,
    )

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim())
      .filter((text) =>
        [
          'Customization',
          'Statistics',
          'About this exercise',
          'Reset Score',
        ].includes(text ?? ''),
      )
    expect(labels).toEqual([
      'Customization',
      'Statistics',
      'About this exercise',
      'Reset Score',
    ])

    await user.click(
      screen.getByRole('button', { name: 'About this exercise' }),
    )
    expect(screen.getByText(CHORD_ABOUT.question)).toBeVisible()
  })
})

describe('the statistics half is read from the view', () => {
  it('names the measure that exercise actually buckets', () => {
    // Written prose would go stale the first time a title changed, and nothing
    // would fail — the manual would simply start lying.
    for (const [name, about, view] of EVERY_EXERCISE) {
      const { unmount } = render(<AboutScreen about={about} view={view} />)

      const headline = bucketedSection(view).title.toLowerCase()
      expect(screen.getByText(headline), name).toBeVisible()
      unmount()
    }
  })

  it('names every other section that exercise keeps', () => {
    render(
      <AboutScreen about={PROGRESSION_ABOUT} view={PROGRESSION_STATS_VIEW} />,
    )

    // Read out of a sentence, so the leading "By" comes off and the rest is
    // lower case — but every section is accounted for.
    const listed = screen.getByText(/It also keeps/).textContent ?? ''
    for (const section of PROGRESSION_STATS_VIEW.sections) {
      if (section.bucketed) continue
      expect(listed, section.title).toContain(
        section.title.replace(/^By /, '').toLowerCase(),
      )
    }
  })

  it('says nothing about breakdowns for a view that has none', () => {
    const bucketedOnly: StatsView = {
      sections: [bucketedSection(INTERVAL_STATS_VIEW)],
    }
    render(<AboutScreen about={INTERVAL_ABOUT} view={bucketedOnly} />)

    expect(screen.queryByText(/It also keeps/)).toBeNull()
  })

  it('takes its numbers from the constants the screen uses', () => {
    // Five and twenty are decisions made elsewhere. Writing them out here
    // would leave the manual quoting a threshold nothing enforces.
    render(<AboutScreen about={INTERVAL_ABOUT} view={INTERVAL_STATS_VIEW} />)

    expect(
      screen.getByText(
        new RegExp(`answered it ${MIN_ATTEMPTS_TO_REPORT} times recently`),
      ),
    ).toBeVisible()
    expect(
      screen.getByText(new RegExp(`last ${RECENT_WINDOW} attempts`)),
    ).toBeVisible()
  })
})
