/**
 * Before the first guess there is no accuracy to report. Showing "0%" there
 * would read as failure, so show a dash instead.
 */
export function formatAccuracy(correct: number, total: number): string {
  if (total === 0) return '—'
  return `${Math.round((correct / total) * 100)}%`
}
