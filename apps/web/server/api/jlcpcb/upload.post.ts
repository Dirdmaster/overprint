import { handleJlcRequest } from '../../utils/jlcRequest'
import { nodeRequestStream } from '../../utils/nodeRequestStream'

let activeUploads = 0
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (activeUploads >= 4) throw createError({ statusCode: 429, statusMessage: 'Uploads are busy. Try again shortly.' })
  const abort = new AbortController()
  const cancel = () => { if (!event.node.res.writableEnded) abort.abort() }
  event.node.res.on('close', cancel)
  activeUploads++
  try {
    return await handleJlcRequest({
      method: event.method, headers: event.headers, url: getRequestURL(event).href,
      body: nodeRequestStream(event.node.req), signal: abort.signal,
    })
  } finally {
    activeUploads--
    event.node.res.off('close', cancel)
    // Discard unread request bytes on rejection; never parse or persist them.
    if (!event.node.req.complete) event.node.req.resume()
  }
})
