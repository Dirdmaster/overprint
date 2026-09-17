import type { IncomingMessage } from 'node:http'
import { MAX_ZIP_BYTES, UploadError } from './jlcUpload.ts'

/** Keep incoming bytes flowing independently of upstream fetch backpressure.
 * The local relay may queue at most one 20 MB ZIP per admitted upload in RAM.
 * Cancel drains unread bytes without closing the response socket.
 */
export function nodeRequestStream(request: IncomingMessage): ReadableStream<Uint8Array> {
  let detach = () => {}
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let received = 0
      const data = (chunk: Uint8Array) => {
        received += chunk.byteLength
        if (received > MAX_ZIP_BYTES) {
          detach()
          controller.error(new UploadError('Choose a ZIP under 20 MB.', 413))
          request.resume()
          return
        }
        controller.enqueue(chunk)
      }
      const end = () => { detach(); controller.close() }
      const error = (error: Error) => { detach(); controller.error(error) }
      const aborted = () => error(new UploadError('ZIP upload was interrupted.', 400))
      detach = () => {
        request.off('data', data)
        request.off('end', end)
        request.off('error', error)
        request.off('aborted', aborted)
      }
      request.on('data', data)
      request.once('end', end)
      request.once('error', error)
      request.once('aborted', aborted)
      request.resume()
    },
    cancel() { detach(); request.resume() },
  }, { highWaterMark: 0 })
}
