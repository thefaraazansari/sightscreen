import { stadiums, stadiumSlug, stadiumSlugs } from './catalog'

/**
 * The stadium the app shows, picked by the `stadium` URL parameter (a key of stadiums.json). Each stadium keeps its
 * code in its own folder (data/layout.ts, Scene.tsx, surroundings/, scripts/), named by `folder` in the JSON.
 * Layout is loaded here, before the app starts, so the rest of the app can use these exports as plain values.
 */
export { stadiums, stadiumSlugs }
export { stadiumSlug }
export const stadium = stadiums[stadiumSlug]

type Layout = typeof import('./wankhede-mumbai/data/layout')
const layouts = import.meta.glob('./*/data/layout.ts') as Record<string, () => Promise<Layout>>
const scenes = import.meta.glob('./*/Scene.tsx') as Record<string, () => Promise<typeof import('./wankhede-mumbai/Scene')>>
const maps = import.meta.glob('./*/data/osm.json')
const layout = await layouts[`./${stadium.folder}/data/layout.ts`]()

export type { RowInfo, SeatSet, Stand } from './createLayout'
export const {
  SLUG,
  STADIUM_NAME,
  A,
  B,
  DEPTH,
  STANDS,
  TIER_NAMES,
  SEAT_COLORS,
  levelsOf,
  PROFILE,
  STRIPS,
  ROWS,
  OUTER,
  TOP,
  buildStrip,
  buildTerrace,
  buildPavilion,
  buildRoof,
  buildRim,
  buildMasts,
  CAPACITY,
  SEATS,
  seatLabel,
  seatEye,
  standView,
  buildBlockPatch,
  blockView,
  blockSurface,
  levelAnchor,
  blockName,
  PITCH_BEARING,
  FIELD_RADII,
  ptOnStand,
  outerRadiusAt,
  TOWERS,
  STRIPS_OF,
  OUTER_OF,
  TOP_OF,
} = layout
export const loadScene = scenes[`./${stadium.folder}/Scene.tsx`]
export const preloadStadium = () => void maps[`./${stadium.folder}/data/osm.json`]?.()
