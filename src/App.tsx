import { Outlet } from 'react-router'

/**
 * App shell. The whole app is designed phone-first, so on wider screens we just
 * center a phone-width column rather than reflowing anything.
 */
export default function App() {
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <Outlet />
    </div>
  )
}
