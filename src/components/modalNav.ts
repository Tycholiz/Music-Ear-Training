import { createContext, useContext, type ReactNode } from 'react'

/**
 * Navigation context for `ModalSheet`. Kept out of the component file so React
 * Fast Refresh still works on the sheet itself.
 */

export interface ModalScreen {
  title: string
  content: ReactNode
}

export interface ModalNav {
  push: (screen: ModalScreen) => void
  pop: () => void
  close: () => void
  /** How many screens deep we are; 0 is the root. */
  depth: number
}

export const ModalNavContext = createContext<ModalNav | null>(null)

export function useModalNav(): ModalNav {
  const nav = useContext(ModalNavContext)
  if (!nav) {
    throw new Error('useModalNav must be used inside a ModalSheet')
  }
  return nav
}
