import type { StadiumData } from './createLayout'
import all from './stadiums.json'

/** Every stadium in stadiums.json (plain data, no 3D code), for the landing page and for choosing which one to load. */
export const stadiums = all as unknown as Record<string, StadiumData>
export const stadiumSlugs = Object.keys(stadiums)

/** The stadium named by the `stadium` URL parameter, else the first one. */
const wanted = new URLSearchParams(location.search).get('stadium') ?? ''
export const stadiumSlug = wanted in stadiums ? wanted : stadiumSlugs[0]
