import { readBoardPackage, type BoardPackage } from '~/utils/boardPackage'

type Pairing = { version: 1; url: string; token: string; origin: string }
type Session = Pairing & { boardId: string; boardName: string; expiresAt: string }
type Candidate = { legacy: boolean; url: string; boardName?: string; boardId?: string; requiresApproval: boolean }
const LIMIT = 25_000_000

const readBody = async (response: Response, limit: number) => {
  const length = Number(response.headers.get('Content-Length'))
  if (!Number.isSafeInteger(length) || length <= 0 || length > limit || !response.body) throw new Error('Invalid or oversized KiCad response.')
  const bytes = new Uint8Array(length)
  const reader = response.body.getReader()
  let offset = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (offset + value.length > length) throw new Error('KiCad response exceeded its declared size.')
      bytes.set(value, offset); offset += value.length
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  if (offset !== length) throw new Error('The KiCad response was incomplete. Try syncing again.')
  return bytes
}

export const useBoardSync = () => {
  const { board, openBoard } = useComposition()
  const isCurrentBoard = (candidate: { url: string; boardId?: string }) => !!candidate.boardId && board.value?.syncSource?.url === candidate.url && board.value.syncSource.boardId === candidate.boardId
  const session = shallowRef<Session>()
  const busy = ref(false)
  const error = ref('')
  const progress = ref('')
  const syncedBoard = shallowRef<BoardPackage>()
  const syncSucceeded = computed(() => !!session.value && !!syncedBoard.value && syncedBoard.value === board.value && !busy.value && !error.value)
  const candidates = ref<Candidate[]>([])
  let controller: AbortController | undefined
  const cancel = () => controller?.abort()
  const disconnect = () => { cancel(); session.value = undefined; error.value = ''; candidates.value = [] }

  const request = async (pairing: Pairing, path: string, signal: AbortSignal) => {
    const response = await fetch(`${pairing.url}${path}`, {
      method: path === '/v1/snapshot' ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${pairing.token}` },
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
    }).catch(cause => { if (cause instanceof TypeError) session.value = undefined; throw cause })
    if (!response.ok) {
      if ([401, 403, 410].includes(response.status)) session.value = undefined
      const messages: Record<number, string> = {
        401: 'The connection is no longer valid. Try Sync again.',
        403: 'This app is no longer connected. Try Sync again.',
        409: 'KiCad is busy or the open board changed. Check KiCad and pair again.',
        410: 'The KiCad session ended. Try again to reconnect.',
        413: 'This board exceeds the 25 MB sync limit.',
        504: 'KiCad took too long to export. Try again when it is ready.',
      }
      throw new Error(messages[response.status] ?? 'KiCad could not export this board. Check its sync window.')
    }
    return response
  }
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (busy.value) return false
    busy.value = true; error.value = ''; controller = new AbortController()
    const timeout = setTimeout(() => controller?.abort(), 80_000)
    try { await action(controller.signal); return true }
    catch (cause) {
      error.value = controller.signal.aborted ? 'Sync cancelled or timed out.'
        : cause instanceof TypeError ? 'Cannot reach KiCad. Open your PCB and try again; allow local network access if your browser asks.'
          : cause instanceof Error ? cause.message : 'Could not sync this board.'
      return false
    } finally { clearTimeout(timeout); controller = undefined; busy.value = false; progress.value = '' }
  }
  const acceptPairing = async (code: string, signal: AbortSignal, expectedBoardId?: string) => {
    let pairing: Pairing
    try {
      const input = JSON.parse(code)
      const url = new URL(input.url)
      if (input.version !== 1 || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password || input.origin !== window.location.origin || typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw new Error()
      pairing = { version: 1, url: url.origin, origin: input.origin, token: input.token }
    } catch { throw new Error('Paste the pairing code from KiCad, using this app’s address for the session.') }
    const response = await request(pairing, '/v1/status', signal)
    if (response.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new Error('Invalid KiCad session response.')
    const status = JSON.parse(new TextDecoder().decode(await readBody(response, 4096)))
    if (status.version !== 1 || typeof status.boardId !== 'string' || !status.boardId || status.boardId.length > 100 || typeof status.boardName !== 'string' || status.boardName.length > 200 || typeof status.expiresAt !== 'string' || !Number.isFinite(Date.parse(status.expiresAt)) || Date.parse(status.expiresAt) <= Date.now()) throw new Error('The KiCad session is invalid or expired.')
    if (expectedBoardId && status.boardId !== expectedBoardId) throw new Error('The selected board changed in KiCad. Scan again and choose its current board.')
    signal.throwIfAborted()
    session.value = { ...pairing, boardId: status.boardId, boardName: status.boardName, expiresAt: status.expiresAt }
  }
  const pair = (code: string) => run(signal => acceptPairing(code, signal))
  const discover = () => run(async signal => {
    candidates.value = []
    progress.value = 'Looking for KiCad…'
    const found = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
      const url = `http://127.0.0.1:${43190 + index}`
      const probeSignal = AbortSignal.any([signal, AbortSignal.timeout(2500)])
      try {
        const response = await fetch(`${url}/v1/discover`, {
          headers: { 'X-Overprint-Pairing': '1' }, signal: probeSignal,
          credentials: 'omit', cache: 'no-store', redirect: 'error',
        })
        if (!response.ok || response.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return
        const status = JSON.parse(new TextDecoder().decode(await readBody(response, 4096)))
        if (status.service !== 'overprint-sync' || ![2, 3].includes(status.version)) return
        return { url, legacy: status.version === 2, requiresApproval: status.requiresApproval !== false,
          boardId: typeof status.boardId === 'string' && status.boardId.length <= 100 ? status.boardId : undefined,
          boardName: typeof status.boardName === 'string' && status.boardName.length <= 200 ? status.boardName : undefined } satisfies Candidate
      } catch { /* Other ports may be unused or belong to unrelated applications. */ }
    }))
    signal.throwIfAborted()
    candidates.value = found.filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)
    if (!candidates.value.length) throw new Error('KiCad wasn’t found. Open a PCB with Overprint plugin v0.1.6 or newer, and allow local network access if your browser asks.')
  })
  const connect = (url: string) => run(async signal => {
    const candidate = candidates.value.find(candidate => candidate.url === url)
    if (!candidate) throw new Error('Search for KiCad again before connecting.')
    progress.value = candidate.requiresApproval ? 'Approve the connection in KiCad…' : 'Connecting to KiCad…'
    const response = await fetch(`${url}/v1/pair`, {
      method: 'POST', headers: { 'X-Overprint-Pairing': '1' }, signal,
      credentials: 'omit', cache: 'no-store', redirect: 'error',
    })
    if (!response.ok) {
      const messages: Record<number, string> = {
        403: 'The connection was declined in KiCad.',
        408: 'Approval timed out. Close the prompt in KiCad, then try again.',
        409: 'Another connection request is waiting in KiCad.',
        410: 'The open PCB changed or the session expired. Try again.',
        429: 'Wait a few seconds before trying again.',
      }
      throw new Error(messages[response.status] ?? 'Could not connect. Check KiCad and try again.')
    }
    if (response.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new Error('Invalid KiCad connection response.')
    const code = new TextDecoder().decode(await readBody(response, 4096))
    if (JSON.parse(code).url !== url) throw new Error('KiCad returned an unexpected connection address.')
    await acceptPairing(code, signal, candidate.boardId)
  })
  const sync = (confirmReplacement?: () => Promise<boolean>) => run(async signal => {
    const current = session.value
    if (!current) throw new Error('Pair with KiCad first.')
    progress.value = 'Syncing your PCB…'
    const before = board.value
    const response = await request(current, '/v1/snapshot', signal)
    if (response.headers.get('X-Overprint-Board-Id') !== current.boardId || response.headers.get('Content-Type')?.split(';')[0] !== 'application/zip') throw new Error('KiCad returned a different board. Pair again before syncing.')
    const bytes = await readBody(response, LIMIT)
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('')
    if (hash !== response.headers.get('X-Overprint-Sha256')) throw new Error('The board snapshot failed its integrity check.')
    const imported = await readBoardPackage(new File([bytes], 'sync.overprint-board', { type: 'application/zip' }))
    signal.throwIfAborted()
    if (board.value !== before || session.value !== current) throw new Error('The board changed while syncing. Try again to refresh the current project.')
    imported.syncSource = { url: current.url, boardId: current.boardId }
    if (confirmReplacement && !isCurrentBoard(current)) {
      if (!(await confirmReplacement())) throw new Error('Opening board cancelled.')
      signal.throwIfAborted()
      if (board.value !== before || session.value !== current) throw new Error('The board changed while opening. Try again.')
      openBoard(imported)
    } else board.value = imported
    syncedBoard.value = board.value
  })
  onBeforeUnmount(disconnect)
  return { session, busy, error, progress, candidates, discover, connect, pair, sync, cancel, disconnect, isCurrentBoard, syncSucceeded }
}
