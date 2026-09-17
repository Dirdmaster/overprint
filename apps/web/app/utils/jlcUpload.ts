const retryableStatus = new Set([408, 429, 500, 502, 503, 504])

const waitForRetry = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted()
  const cancel = () => { clearTimeout(timer); reject(signal.reason) }
  const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, 1000)
  signal.addEventListener('abort', cancel, { once: true })
})

/** Replay the immutable ZIP once on transient failure; never regenerate artwork. */
export const uploadJlcZip = async (
  zip: Blob,
  signal: AbortSignal,
  onRetry: () => void,
  fetcher: typeof fetch = fetch,
): Promise<Response> => {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    let response: Response
    try {
      response = await fetcher('/api/jlcpcb/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: zip,
        signal: AbortSignal.any([signal, AbortSignal.timeout(65_000)]),
      })
    } catch (error) {
      signal.throwIfAborted()
      const transient = error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError')
      if (attempt > 0 || !transient) throw error
      onRetry()
      await waitForRetry(signal)
      continue
    }
    if (attempt > 0 || !retryableStatus.has(response.status)) return response
    await response.body?.cancel()
    signal.throwIfAborted()
    onRetry()
    await waitForRetry(signal)
  }
}
