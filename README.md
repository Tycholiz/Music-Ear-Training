# Music Ear Training

A mobile-first PWA for musicians to practice ear training. Two exercises:

- **Interval Ear Training** — two notes play, identify the interval
- **Chord Ear Training** — a chord plays, identify the quality

Installable to the home screen and fully functional offline.

## Stack

|               |                                                               |
| ------------- | ------------------------------------------------------------- |
| Build         | Vite                                                          |
| UI            | React + TypeScript                                            |
| Styling       | Tailwind CSS v4 (CSS-first config, tokens in `src/index.css`) |
| Routing       | react-router                                                  |
| Tests         | Vitest + Testing Library                                      |
| Lint / format | oxlint + Prettier                                             |
| Hosting       | Vercel                                                        |

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Script                  | Does                                        |
| ----------------------- | ------------------------------------------- |
| `npm run dev`           | Dev server                                  |
| `npm run build`         | Typecheck then production build to `dist/`  |
| `npm run preview`       | Serve the production build locally          |
| `npm test`              | Run tests once                              |
| `npm run test:watch`    | Tests in watch mode                         |
| `npm run test:coverage` | Tests with a coverage report                |
| `npm run lint`          | oxlint                                      |
| `npm run format`        | Prettier, writing in place                  |
| `npm run format:check`  | Prettier, check only                        |
| `npm run icons`         | Regenerate app icons from `public/icon.svg` |

## Layout

```
src/
  routes/      one file per screen, plus route-level tests
  pwa/         install offer, update prompt, standalone detection
  components/  shared UI kit (see issue #3)
  test/        Vitest setup
  index.css    Tailwind import + design tokens
  App.tsx      app shell — centers a phone-width column
  main.tsx     router config and mount
```

## Conventions

- **Dark theme only.** Colors come from the `@theme` block in `src/index.css` and are used as Tailwind utilities (`bg-surface`, `text-content-muted`, `text-accent`, …). Don't hardcode hex values in components.
- **Phone-first.** Every screen is designed for a phone; wide viewports just center a `max-w-md` column.
- **Music theory logic stays pure.** Pitch, interval, and chord code lives outside React and is unit tested directly (see issue #2).

## Offline and installation

The app is a PWA: the shell and all 52 piano samples (~1.5 MB) are precached by
a Workbox service worker, so it launches and plays with no network at all.

Icons are generated from `public/icon.svg` by `npm run icons` and committed.
They are not built on demand — they change about never, and this keeps `sharp`,
a large native dependency, off the build path. Edit the SVG and rerun the
script.

A new deployment does not take over a running session. The service worker is
registered with `registerType: 'prompt'`, so a waiting update surfaces as a
banner and applies when the user chooses — reloading mid-question would throw
away whatever they were part-way through.

## Deployment

Pushes to `main` deploy to Vercel. `vercel.json` rewrites all paths to `index.html` so deep links like `/intervals` survive a hard refresh.
