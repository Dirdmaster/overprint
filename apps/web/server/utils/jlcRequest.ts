import { uploadToJlc, UploadError, type UploadSource } from './jlcUpload'

export function validateUploadRequest(method: string, headers: Pick<Headers, 'get'>, url: string) {
  if (method !== 'POST') throw new UploadError('Use POST to upload a ZIP.', 405)
  if (headers.get('origin') !== new URL(url).origin) throw new UploadError('Upload from the Overprint editor.', 403)
  if (headers.get('content-type') !== 'application/zip') throw new UploadError('Expected a ZIP file.', 415)
  return Number(headers.get('content-length'))
}

// Only the Web Request capabilities used here; DOM and Workers declarations
// differ in unrelated iterator/event overloads, but implement this same shape.
type UploadRequest = {
  url: string
  method: string
  headers: Pick<Headers, 'get'>
  body: UploadSource | null
  signal: {
    aborted: boolean
    addEventListener(type: 'abort', listener: () => void, options: { once: boolean }): void
    removeEventListener(type: 'abort', listener: () => void): void
  }
}

/** Web Request adapter, used before Nitro's Pages request-body buffering. */
export async function handleJlcRequest(request: UploadRequest, fetcher: typeof fetch = fetch): Promise<Response> {
  const disconnected = new AbortController()
  const disconnect = () => disconnected.abort()
  request.signal.addEventListener('abort', disconnect, { once: true })
  if (request.signal.aborted) disconnect()
  try {
    const size = validateUploadRequest(request.method, request.headers, request.url)
    if (!request.body) throw new UploadError('Choose a valid, nonempty ZIP.', 400)
    const result = await uploadToJlc(request.body, size, disconnected.signal, fetcher)
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const statusCode = error instanceof UploadError ? error.statusCode : 502
    const statusMessage = error instanceof UploadError ? error.message : 'Upload failed.'
    return Response.json({ statusCode, statusMessage }, { status: statusCode, headers: { 'Cache-Control': 'no-store' } })
  } finally {
    request.signal.removeEventListener('abort', disconnect)
    await request.body?.cancel().catch(() => {})
  }
}
