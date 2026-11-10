import nitroPages from 'nitropack/presets/cloudflare/runtime/cloudflare-pages'
import { handleJlcRequest } from './utils/jlcRequest'
import { handleGoogleFontsRequest } from './utils/googleFonts'

// Nitro 2.13's Pages adapter reads request.arrayBuffer() before routing.
// Handle uploads first to retain backpressure and cancellation end to end.
export default {
  ...nitroPages,
  fetch(...args: Parameters<typeof nitroPages.fetch>) {
    const [request, env] = args
    const path = new URL(request.url).pathname
    if (/^\/api\/jlcpcb\/upload\/*$/.test(path)) return handleJlcRequest(request)
    if (/^\/api\/fonts\/(catalog|file)\/?$/.test(path)) return handleGoogleFontsRequest(request, typeof env.NUXT_GOOGLE_FONTS_API_KEY === 'string' ? env.NUXT_GOOGLE_FONTS_API_KEY : undefined)
    // No other API/body routes exist. Reject before Nitro can buffer them.
    if (path.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method)) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    return nitroPages.fetch(...args)
  },
}
