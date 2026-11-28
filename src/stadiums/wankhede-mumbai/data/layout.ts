import { createLayout, type StadiumData } from '../../createLayout'
import stadiums from '../../stadiums.json'

export type { RowInfo, SeatSet, Stand } from '../../createLayout'

/** Which entry of stadiums.json this folder renders. */
export const STADIUM_ID = 'wankhede-stadium'

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
} = createLayout((stadiums as Record<string, StadiumData>)[STADIUM_ID])
