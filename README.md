# SightScreen

Preview the view from your seat before you book. SightScreen is an interactive 3D model of Wankhede Stadium, Mumbai. Pick a stand, block or seat, see what the pitch looks like from there, and switch the time of day. Then jump to a booking site.

**Live:** https://thefaraazansari.github.io/sightscreen/

## Stack

React 19, TypeScript, Vite, Three.js (React Three Fiber + drei), Tailwind CSS 4, Zustand. Linting and formatting with Biome.

## Run locally

```sh
npm install
npm run dev
```

| Command           | What it does                        |
| ----------------- | ----------------------------------- |
| `npm run dev`     | Start the dev server                |
| `npm run build`   | Type-check and build into `dist/`   |
| `npm run preview` | Serve the production build          |
| `npm run lint`    | Lint and check formatting (Biome)   |
| `npm run format`  | Auto-fix lint issues and formatting |

## Project layout

- `src/stadiums/stadiums.json`: seating data for every stadium (stands, blocks, levels, capacity).
- `src/stadiums/createLayout.ts`: builds seats and geometry from one stadium's JSON.
- `src/stadiums/shared/`: stadium-independent 3D parts (stands, blocks, camera, lighting, players).
- `src/stadiums/<stadium>/`: `data/layout.ts` (picks its JSON entry), `Scene.tsx`, and `surroundings/` (roads, sea, rail, city).
- `src/stadiums/current.ts`: selects the stadium the app shows.
- `src/store/`: Zustand state (mode, selected stand, block, seat).
- `src/ui/`: side panel, time toggle, tooltip, booking links.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`, which:

1. builds the app and deploys it to GitHub Pages,
2. creates a GitHub release named `SightScreen vX.Y.Z`, with tag `vX.Y.Z`. The patch number goes up by one each time, starting at `v1.0.0`.

One-time setup: in the repo go to Settings → Pages → Source and choose **GitHub Actions**.

## Adding a stadium

1. Add an entry to `src/stadiums/stadiums.json` (see the Wankhede and Melbourne Cricket Ground entries: stands, levels, capacity, `folder`, flag, ticket links, listing order; non-oval grounds also give `field.radii` every 5° and `field.pitchBearing`).
2. Create `src/stadiums/<folder>/` with `data/layout.ts` (copy one of the existing ones and change `STADIUM_ID`), `data/osm.json` (built by that folder's `scripts/build_osm.py` from an Overpass download) and `Scene.tsx` plus `surroundings/`.
3. It appears on the landing page automatically. Map data © OpenStreetMap contributors (ODbL).
