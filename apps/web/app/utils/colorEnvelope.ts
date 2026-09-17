// Experimental JLC color envelope; protocol facts recorded in the compatibility probe.
const key = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzPtuUqJecaR/wWtctGT8
QuVslmDH3Ut3s8c1Ls4A+M9rwpeLjgDUqfcrSrTHBrl5k/dOeJEWMeNF7STWS5jo
WZE0H60cvf2bhormC9S6CRwq4Lw0ua0YQMo66R/qCtLVa5w6WkaPCz4b0xaHWtej
JH49C0T67rU2DkepXuMPpwNCflMU+WgEQioZEldUTD6gYpu2U5GrW4AE0AQiIo+j
e7tgN8PlBMbMaEfu0LokZyth1ugfuLAgyogWnedAegQmPZzAUe36Sni94AsDlhxm
mjFl+WQZzD3MclbEY6KQB5XL8zCR/J6pCUUwfHantLxY/gQi0XJG5hWWtDyH/fR2
lwIDAQAB`
export const encryptColorSvg = async (svg: string): Promise<Uint8Array<ArrayBuffer>> => {
  const publicKey = await crypto.subtle.importKey('spki', Uint8Array.from(atob(key), c => c.charCodeAt(0)), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
  const secret = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const aes = await crypto.subtle.importKey('raw', secret, 'AES-GCM', false, ['encrypt'])
  const parts = await Promise.all([
    crypto.subtle.encrypt('RSA-OAEP', publicKey, secret),
    crypto.subtle.encrypt('RSA-OAEP', publicKey, iv),
    crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(svg)),
  ])
  const result = new Uint8Array(parts.reduce((n, part) => n + part.byteLength, 0))
  let offset = 0
  for (const part of parts) { result.set(new Uint8Array(part), offset); offset += part.byteLength }
  return result
}
