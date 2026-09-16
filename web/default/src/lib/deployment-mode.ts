export const IS_DEMO = import.meta.env.VITE_SNOWAPI_DEMO === 'true'
export const APP_BASE_PATH =
  (import.meta.env.VITE_APP_BASE_PATH || '/').replace(/\/+$/, '') || '/'

export function appPath(path: string): string {
  return `${APP_BASE_PATH === '/' ? '' : APP_BASE_PATH}/${path.replace(/^\/+/, '')}`
}
