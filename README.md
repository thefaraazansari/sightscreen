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

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`, which:

1. builds the app and deploys it to GitHub Pages,
2. creates a GitHub release named `SightScreen vX.Y.Z`, with tag `vX.Y.Z`. The patch number goes up by one each time, starting at `v1.0.0`.

One-time setup: in the repo go to Settings → Pages → Source and choose **GitHub Actions**.
