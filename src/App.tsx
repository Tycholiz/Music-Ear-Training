import { Outlet } from 'react-router'
import { UpdatePrompt } from './pwa'

/**
 * App shell. The whole app is designed phone-first, so on wider screens we just
 * center a phone-width column rather than reflowing anything.
 *
 * The `safe-area` padding matters only when installed: `viewport-fit=cover`
 * lets the layout run under the status bar and home indicator, which a browser
 * tab hides behind its own chrome but a standalone app does not. Without it the
 * score and menu sit under the notch.
 */
export default function App() {
  return (
    <div className="safe-area mx-auto flex h-full w-full max-w-md flex-col">
      <Outlet />
      <UpdatePrompt />
    </div>
  )
}
