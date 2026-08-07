import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { AboutPage, ModalSheet, type AboutContent } from '../components'
import { chordSettingsStore, chordStatsStore } from '../settings'
import { CHORD_STATS_VIEW, answerFor } from '../exercises'
import { intervalName } from '../theory'
import {
  CHORD_ABOUT,
  HOW_TO_USE_THIS_APP,
  INTERVAL_ABOUT,
  MELODY_ABOUT,
  PROGRESSION_ABOUT,
  ROOT_ABOUT,
} from '../about/pages'
import { ChordSettingsMenu } from './ChordSettingsMenu'

const EXERCISE_PAGES: [string, AboutContent][] = [
  ['intervals', INTERVAL_ABOUT],
  ['chords', CHORD_ABOUT],
  ['chord root', ROOT_ABOUT],
  ['melody', MELODY_ABOUT],
  ['progressions', PROGRESSION_ABOUT],
]

function show(content: AboutContent) {
  return render(
    <MemoryRouter>
      <AboutPage content={content} />
    </MemoryRouter>,
  )
}

describe('every page', () => {
  it('shows each heading and every paragraph under it', () => {
    for (const [name, content] of [
      ...EXERCISE_PAGES,
      ['how to use this app', HOW_TO_USE_THIS_APP] as [string, AboutContent],
    ]) {
      const { unmount } = show(content)

      for (const section of content) {
        expect(
          screen.getByRole('heading', { name: section.title }),
          `${name}: ${section.title}`,
        ).toBeVisible()
      }
      unmount()
    }
  })

  it('opens with what the exercise asks you to do', () => {
    for (const [name, content] of EXERCISE_PAGES) {
      expect(content[0].title, name).toBe('What it asks')
    }
  })

  it('says nothing about the statistics that the general page says', () => {
    // Repeating the thresholds on five pages is how a manual goes out of date
    // in four places at once.
    for (const [name, content] of EXERCISE_PAGES) {
      const words = content
        .flatMap((section) => section.paragraphs)
        .join(' ')
        .toLowerCase()

      expect(words, name).not.toContain('twenty attempts')
      expect(words, name).not.toContain('swipe')
    }
  })
})

describe('the descending naming disclaimer', () => {
  it('matches what the code actually answers', () => {
    // The page tells the user that a D followed by the C below it is a minor
    // 7th here rather than a major 2nd. If that convention ever changed, the
    // manual is the last place anyone would think to look — so the claim is
    // checked against the function that makes it true.
    const D = 62
    const C_BELOW = 60

    expect(intervalName(answerFor(D, C_BELOW, 'descending'))).toBe('Minor 7th')
  })

  it('is right that both directions land on the same note', () => {
    // The reason the naming is not arbitrary, and the sentence the page leans
    // on: a minor 7th below the root and a minor 7th above it are the same
    // note an octave apart, so one name covers both.
    const D = 62
    const C_BELOW = 60

    expect(answerFor(D, C_BELOW + 12, 'ascending')).toBe(
      answerFor(D, C_BELOW, 'descending'),
    )
  })

  it('is on the interval page, where someone marked wrong will look', () => {
    const words = INTERVAL_ABOUT.flatMap((section) => section.paragraphs).join(
      ' ',
    )
    expect(words).toContain('major 2nd')
    expect(words).toContain('minor 7th')
  })
})

describe('emphasis', () => {
  it('italicises the bucket names rather than printing the asterisks', () => {
    show([
      {
        title: 'Test',
        paragraphs: ['Sorted into *needs work*, *getting there* and *solid*.'],
      },
    ])

    for (const bucket of ['needs work', 'getting there', 'solid']) {
      const marked = screen.getByText(bucket)
      expect(marked.tagName, bucket).toBe('EM')
    }
    expect(screen.queryByText(/\*/)).toBeNull()
  })

  it('names the buckets in italics wherever a page mentions them', () => {
    for (const [name, content] of EXERCISE_PAGES) {
      const words = content.flatMap((section) => section.paragraphs).join(' ')

      for (const bucket of ['needs work', 'getting there', 'solid']) {
        const bare = new RegExp(`(?<!\\*)\\b${bucket}\\b(?!\\*)`, 'i')
        const inside = words.replace(new RegExp(`\\*${bucket}\\*`, 'gi'), '')
        expect(inside, `${name}: ${bucket}`).not.toMatch(bare)
      }
    }
  })
})

describe('links out', () => {
  it('sends someone struggling with inversions to the root exercise', () => {
    // The advice is "go and practise the other thing", so it should not then
    // make them find it themselves.
    show(PROGRESSION_ABOUT)

    const link = screen.getByRole('link', { name: /Chord Root Recognition/ })
    expect(link).toHaveAttribute('href', '/chord-root')
  })
})

describe('reaching it from the menu', () => {
  it('sits between Statistics and Reset Score', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ModalSheet open onClose={vi.fn()} title="Menu">
          <ChordSettingsMenu
            store={chordSettingsStore}
            statsStore={chordStatsStore}
            statsView={CHORD_STATS_VIEW}
            about={CHORD_ABOUT}
            onResetScore={vi.fn()}
          />
        </ModalSheet>
      </MemoryRouter>,
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
    expect(
      screen.getByRole('heading', { name: CHORD_ABOUT[0].title }),
    ).toBeVisible()
  })
})
