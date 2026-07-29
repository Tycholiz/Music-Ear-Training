import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import App from './App.tsx'
import Home from './routes/Home.tsx'
import Intervals from './routes/Intervals.tsx'
import Chords from './routes/Chords.tsx'
import ChordRoot from './routes/ChordRoot.tsx'
import Melody from './routes/Melody.tsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'intervals', element: <Intervals /> },
      { path: 'chords', element: <Chords /> },
      { path: 'chord-root', element: <ChordRoot /> },
      { path: 'melody', element: <Melody /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
