import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const macPython = '/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3'
const python = process.env.KICAD_PYTHON || (existsSync(macPython) ? macPython : 'python3')
const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
