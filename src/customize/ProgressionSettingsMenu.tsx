import { ListCard, ListRow } from '../components'

/**
 * Hamburger menu for the chord progression exercise.
 *
 * Customize lands in #76; until then the menu carries what exists, so the
 * header's menu button is not a dead end.
 */
export function ProgressionSettingsMenu({
  onResetScore,
}: {
  onResetScore: () => void
}) {
  return (
    <div className="p-4">
      <ListCard>
        <ListRow label="Reset Score" destructive onClick={onResetScore} />
      </ListCard>
    </div>
  )
}
