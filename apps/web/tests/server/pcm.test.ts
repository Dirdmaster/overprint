import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zipSync, strToU8 } from 'fflate'
import { writePcmRepository } from '../../scripts/pcm-repository.mjs'

test('PCM feed hashes and sizes match the downloadable package and keep archive metadata intact', () => {
  const directory = mkdtempSync(join(tmpdir(), 'overprint-pcm-'))
  try {
    const metadata = { author: { name: 'Overprint' }, versions: [{ version: '0.1.10', status: 'development' }] }
    const archive = zipSync({ 'metadata.json': strToU8(JSON.stringify(metadata)), 'plugins/test.py': strToU8('pass\n') })
    const destination = pathToFileURL(`${directory}/`)
    writePcmRepository(archive, destination, 'https://overprint.ink/pcm/', 1789680000)
    const repository = JSON.parse(readFileSync(join(directory, 'repository.json'), 'utf8'))
    const packages = readFileSync(join(directory, 'packages.json'))
    const version = JSON.parse(packages.toString()).packages[0].versions[0]
    const download = readFileSync(join(directory, new URL(version.download_url).pathname.split('/').at(-1)!))
    const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
    assert.equal(repository.packages.sha256, hash(packages))
    assert.equal(version.download_sha256, hash(download))
    assert.equal(version.download_size, archive.length)
    assert.equal(version.install_size, Buffer.byteLength(JSON.stringify(metadata)) + 5)
    assert.deepEqual(download, Buffer.from(archive))
    assert.equal(repository.schema_version, 2)
    assert.equal(repository.packages.url, 'https://overprint.ink/pcm/packages.json')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
