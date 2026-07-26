import { Link } from 'react-router'
import type { ReactNode } from 'react'

/**
 * iOS-style grouped inset list.
 *
 * `ListCard` is the rounded container; `ListRow` is a single row inside it.
 * Separators are drawn by the rows themselves so that the first row never
 * shows one, which is what keeps the top edge clean against the rounded corner.
 */

export function ListCard({
  title,
  footer,
  children,
}: {
  /** Uppercase section header shown above the card. */
  title?: string
  /** Muted explanatory text shown below the card. */
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      {title && (
        <h2 className="px-4 pb-1.5 text-xs font-medium tracking-wide text-content-muted uppercase">
          {title}
        </h2>
      )}
      <div className="overflow-hidden rounded-xl bg-surface">{children}</div>
      {footer && (
        <p className="px-4 pt-2 text-sm text-content-muted">{footer}</p>
      )}
    </section>
  )
}

export function ListRow({
  label,
  value,
  chevron = false,
  destructive = false,
  onClick,
  to,
  icon,
  children,
}: {
  label?: ReactNode
  /** Muted text shown at the trailing edge, before any chevron. */
  value?: ReactNode
  /** Show a trailing chevron to signal that this row navigates. */
  chevron?: boolean
  /** Render the label in the accent color, for actions like Reset Score. */
  destructive?: boolean
  onClick?: () => void
  /**
   * Render the row as a router link instead of a button. Rows that change the
   * URL should be real links so they can be opened in a new tab and so the
   * back button behaves.
   */
  to?: string
  /** Leading glyph, shown before the label. */
  icon?: ReactNode
  /** Custom row content, used instead of `label`. */
  children?: ReactNode
}) {
  const content = children ?? (
    <>
      <span className="flex min-w-0 items-center gap-3">
        {icon}
        <span className={destructive ? 'text-incorrect' : undefined}>
          {label}
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-content-muted">
        {value}
        {chevron && <ChevronRight />}
      </span>
    </>
  )

  const className =
    'flex w-full items-center justify-between gap-3 border-t border-separator px-4 py-3.5 text-left first:border-t-0'

  if (to) {
    return (
      <Link to={to} className={`${className} active:bg-surface-raised`}>
        {content}
      </Link>
    )
  }

  if (!onClick) {
    return <div className={className}>{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} active:bg-surface-raised`}
    >
      {content}
    </button>
  )
}

export function ChevronRight() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 20"
      className="h-3.5 w-2 stroke-current"
      fill="none"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 2l8 8-8 8" />
    </svg>
  )
}
