import { handleGoogleFontsRequest } from '../../utils/googleFonts'
export default defineEventHandler(event => handleGoogleFontsRequest({
  url: getRequestURL(event).href, method: event.method, headers: event.headers,
}, useRuntimeConfig(event).googleFontsApiKey))
