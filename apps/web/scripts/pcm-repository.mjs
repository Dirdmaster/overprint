import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { unzipSync } from 'fflate'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`)

/** Build the index from the exact archive we serve, never a second metadata copy. */
export const writePcmRepository = (archive, destination, baseUrl = 'https://overprint.ink/pcm/', timestamp = Math.floor(Date.now() / 1000), release = null) => {
  const files = unzipSync(archive)
  const metadata = JSON.parse(Buffer.from(files['metadata.json']).toString())
  if (metadata.versions.length !== 1) throw new Error('PCM build expects one packaged version')
  const digest = sha256(archive)
  const filename = `overprint-kicad-${metadata.versions[0].version}-${digest.slice(0, 12)}.zip`
  const published = release?.version === metadata.versions[0].version && release.sha256 === digest
  metadata.versions[0] = {
    ...metadata.versions[0],
    download_url: published ? release.url : new URL(filename, baseUrl).href,
    download_sha256: digest,
    download_size: archive.length,
    install_size: Object.values(files).reduce((total, bytes) => total + bytes.length, 0),
  }
  const packages = json({ packages: [metadata] })
  const repository = json({
    name: 'Overprint',
    schema_version: 2,
    maintainer: metadata.author,
    packages: {
      url: new URL('packages.json', baseUrl).href,
      sha256: sha256(packages),
      update_timestamp: timestamp,
      update_time_utc: new Date(timestamp * 1000).toISOString().slice(0, 19).replace('T', ' '),
    },
  })
  mkdirSync(destination, { recursive: true })
  writeFileSync(new URL(filename, destination), archive)
  writeFileSync(new URL('packages.json', destination), packages)
  writeFileSync(new URL('repository.json', destination), repository)
}
