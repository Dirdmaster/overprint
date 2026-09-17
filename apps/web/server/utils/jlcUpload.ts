export const MAX_ZIP_BYTES = 20_000_000
const UPLOAD_URL = 'https://cart.jlcpcb.com/api/overseas-core-platform/file/uploadGerber'
export class UploadError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 502) { super(message); this.statusCode = statusCode }
}

export type UploadReader = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
  cancel(): Promise<void>
  releaseLock(): void
}
export type UploadSource = { getReader(): UploadReader; cancel(): Promise<void> }

export const uploadToJlc = async (
  source: UploadSource,
  size: number,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) => {
  if (!Number.isSafeInteger(size) || size < 4 || size > MAX_ZIP_BYTES) throw new UploadError('Choose a ZIP under 20 MB.', 413)
  const boundary = `overprint-${crypto.randomUUID()}`
  const encoder = new TextEncoder()
  const prefix = encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="calculationCostsType"\r\n\r\n1\r\n--${boundary}\r\nContent-Disposition: form-data; name="gerberFile"; filename="overprint.zip"\r\nContent-Type: application/zip\r\n\r\n`)
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`)
  const input = source.getReader()
  let inputError: UploadError | undefined
  let inputComplete = false
  const parts = (async function* () {
    let count = 0
    let checked = false
    let first = new Uint8Array(0)
    try {
      while (true) {
        const next = await input.read()
        if (next.done || !next.value) break
        const chunk = next.value
        count += chunk.byteLength
        if (count > size) throw new UploadError('ZIP exceeds its declared size.', 413)
        if (!checked) {
          const combined = new Uint8Array(first.length + chunk.length)
          combined.set(first)
          combined.set(chunk, first.length)
          first = combined
          if (first.length < 4) continue
          if (![0x50, 0x4b, 0x03, 0x04].every((byte, index) => first[index] === byte)) throw new UploadError('Choose a valid, nonempty ZIP.', 400)
          checked = true
          yield prefix
          yield first
          first = new Uint8Array(0)
        } else yield chunk
      }
      if (!checked || count !== size) throw new UploadError(`ZIP upload was incomplete (received ${count} of ${size} bytes).`, 400)
      inputComplete = true
      yield suffix
    } catch (error) {
      inputError = error instanceof UploadError ? error : new UploadError('ZIP upload was interrupted.', 400)
      throw inputError
    }
  })()
  const multipart = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const part = await parts.next()
        if (part.done) controller.close()
        else controller.enqueue(part.value)
      } catch (error) { controller.error(error) }
    },
    async cancel() { await parts.return() },
  }, { highWaterMark: 0 })
  // Workers ignores an explicit Content-Length for an arbitrary stream. Its
  // fixed-length stream preserves that header without collecting the ZIP.
  const FixedLength = (globalThis as typeof globalThis & {
    FixedLengthStream?: new (length: number) => TransformStream<Uint8Array, Uint8Array>
  }).FixedLengthStream
  const fixed = FixedLength ? new FixedLength(prefix.length + size + suffix.length) : undefined
  const body = fixed?.readable ?? multipart
  const timeout = AbortSignal.timeout(60_000)
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout
  const cancelInput = () => { void input.cancel().catch(() => {}) }
  abort.addEventListener('abort', cancelInput, { once: true })
  if (abort.aborted) cancelInput()
  const cleanup = new AbortController()
  const pipe = fixed ? multipart.pipeTo(fixed.writable, { signal: AbortSignal.any([abort, cleanup.signal]) }) : undefined
  // Observe immediately; rethrow in the request lifecycle below.
  let pipeError: unknown
  const piping = pipe?.catch(error => { pipeError = error })
  try {
    const options: RequestInit & { duplex: 'half' } = {
      method: 'POST', body, duplex: 'half', signal: abort,
      redirect: 'manual',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(prefix.length + size + suffix.length) },
    }
    const response = await fetcher(UPLOAD_URL, options)
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new UploadError('JLCPCB could not accept the upload. Try again.')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > 65_536) throw new UploadError('Unexpected upload response from JLCPCB.')
        chunks.push(value)
      }
    } finally { await reader.cancel().catch(() => {}) }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const result = JSON.parse(new TextDecoder().decode(bytes))
    if (result.success !== true || result.code !== 200 || typeof result.data?.fileId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(result.data.fileId)) throw new UploadError('JLCPCB rejected the ZIP. Check the manufacturing files.')
    if (result.data.s3SignatureResponse?.local !== true) throw new UploadError('JLCPCB requested an additional upload step that is not supported yet.')
    if (pipeError) throw pipeError
    if (!inputComplete) throw new UploadError('JLCPCB replied before the ZIP upload completed. Try again.')
    const quote = new URL('https://cart.jlcpcb.com/quote/')
    quote.searchParams.set('homeUploadNum', result.data.fileId)
    return { quoteUrl: quote.href }
  } catch (error) {
    // Cancelling a reader ends pending reads just like EOF. Do not mistake that
    // for a truncated browser request when the relay itself stopped the input.
    if (abort.aborted) throw new UploadError('Upload timed out or was cancelled.')
    if (inputError) throw inputError
    if (error instanceof UploadError) throw error
    throw new UploadError(abort.aborted ? 'Upload timed out or was cancelled.' : 'Could not upload to JLCPCB. Try again.')
  } finally {
    // Unblock an outstanding read before returning the multipart generator.
    await input.cancel().catch(() => {})
    abort.removeEventListener('abort', cancelInput)
    cleanup.abort()
    if (!body.locked) await body.cancel().catch(() => {})
    await piping
    input.releaseLock()
  }
}
