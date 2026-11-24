export type TimeOfDay = 'day' | 'evening' | 'night'

export interface TimePreset {
  label: string
  skyTop: string
  horizon: string
  sunDir: [number, number, number]
  sunColor: string
  sunIntensity: number
  sunGlow: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  fog: string
  ground: string
  /** 0..1 floodlight power */
  flood: number
  stars: number
  exposure: number
  /** Hover highlight colour */
  highlight: string
}

export const TIMES: Record<TimeOfDay, TimePreset> = {
  day: {
    label: 'Day',
    skyTop: '#2f80d8',
    horizon: '#cfe6fb',
    sunDir: [0.45, 0.8, 0.35],
    sunColor: '#fff4dc',
    sunIntensity: 2.8,
    sunGlow: 0.25,
    hemiSky: '#cfe6ff',
    hemiGround: '#7a8f6a',
    hemiIntensity: 1.2,
    fog: '#c4dcf0',
    ground: '#a29d8f',
    flood: 0,
    stars: 0,
    exposure: 1,
    highlight: '#ffb703',
  },
  evening: {
    label: 'Evening',
    skyTop: '#3a3d82',
    horizon: '#ff9f55',
    sunDir: [-0.85, 0.16, 0.45],
    sunColor: '#ff9a3c',
    sunIntensity: 2.4,
    sunGlow: 1,
    hemiSky: '#ffb98a',
    hemiGround: '#5b4a40',
    hemiIntensity: 0.75,
    fog: '#e8a06a',
    ground: '#8a7d68',
    flood: 0.3,
    stars: 0,
    exposure: 1,
    highlight: '#ffe08a',
  },
  night: {
    label: 'Night',
    skyTop: '#01030c',
    horizon: '#0c1a3a',
    sunDir: [0.3, 0.7, -0.4],
    sunColor: '#8aa5ff',
    sunIntensity: 0.22,
    sunGlow: 0,
    hemiSky: '#3a5496',
    hemiGround: '#1a2418',
    hemiIntensity: 0.4,
    fog: '#0b1328',
    ground: '#151a20',
    flood: 1,
    stars: 1,
    exposure: 1.1,
    highlight: '#fff0b0',
  },
}
