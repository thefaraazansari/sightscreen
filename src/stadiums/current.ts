/**
 * The stadium the app shows. Each stadium lives in its own folder next to this file (data/, three/, scripts/);
 * to show a different one, point these exports at its folder.
 */
export * from './wankhede-mumbai/data/layout'
export { zoomBy } from './wankhede-mumbai/three/CameraRig'
export const loadScene = () => import('./wankhede-mumbai/three/Scene')
export const preloadStadium = () => void import('./wankhede-mumbai/data/osm.json')
