import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const verifier = fileURLToPath(new URL('./verify-release-truth.mjs', import.meta.url))
const report = 'Synthetic regression fixture; not release evidence.'

function metadataFor(channel) {
  return {
    macos: {
      platform: 'macos',
      channel,
      signed: channel !== 'preview',
      notarized: channel !== 'preview',
    },
    windows: {
      platform: 'windows',
      channel,
      signed: channel === 'trusted',
      notarized: false,
    },
  }
}

function runVerifier(channel, metadata, validationReport = report) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codexvault-release-truth-'))
  try {
    const inputDirectory = path.join(directory, 'input')
    const outputPath = path.join(directory, 'release-truth.json')
    fs.mkdirSync(inputDirectory)
    for (const [platform, entry] of Object.entries(metadata)) {
      fs.writeFileSync(path.join(inputDirectory, `${platform}.json`), JSON.stringify(entry))
    }
    const child = spawnSync(
      process.execPath,
      [
        verifier,
        '--channel', channel,
        '--metadata-dir', inputDirectory,
        '--windows-validation-report', validationReport,
        '--output', outputPath,
      ],
      { encoding: 'utf8', timeout: 5000 },
    )
    assert.equal(child.error, undefined)
    assert.equal(child.signal, null)
    return {
      status: child.status,
      stderr: child.stderr,
      result: JSON.parse(fs.readFileSync(outputPath, 'utf8')),
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

for (const [channel, tier] of [
  ['preview', 'preview'],
  ['partial', 'partial-macos-trusted'],
  ['trusted', 'trusted-cross-platform'],
]) {
  test(`valid boolean metadata preserves the ${channel} channel`, () => {
    const { status, result } = runVerifier(channel, metadataFor(channel))
    assert.equal(status, 0)
    assert.deepEqual(result.failures, [])
    assert.equal(result.trustTier, tier)
    assert.equal(result.trusted, channel === 'trusted')
    assert.equal(result.checks.macosSigned, channel !== 'preview')
    assert.equal(result.checks.macosNotarized, channel !== 'preview')
    assert.equal(result.checks.windowsSigned, channel === 'trusted')
  })
}

const trustFields = [
  ['macos', 'signed', 'macosSigned'],
  ['macos', 'notarized', 'macosNotarized'],
  ['windows', 'signed', 'windowsSigned'],
]
const malformedValues = [
  ['false string', 'false'],
  ['true string', 'true'],
  ['zero', 0],
  ['one', 1],
  ['array', []],
  ['object', {}],
  ['null', null],
  ['missing field', undefined],
]

for (const channel of ['preview', 'partial', 'trusted']) {
  for (const [platform, field, check] of trustFields) {
    for (const [description, value] of malformedValues) {
      test(`${channel} rejects ${description} for ${platform}.${field}`, () => {
        const metadata = metadataFor(channel)
        metadata[platform][field] = value
        const { status, stderr, result } = runVerifier(channel, metadata)
        assert.equal(status, 1)
        assert.match(stderr, /must be a boolean/)
        assert.equal(result.checks[check], false)
        assert.equal(result.trusted, false)
        assert.equal(result.trustTier, 'preview')
        assert.equal(result.platformTrust[`${platform}Trusted`], false)
        assert.match(result.platformLabels[platform], /Unsigned Preview/)
        assert.doesNotMatch(result.releaseNotesLabel, /Fully trusted|Trust status: Partial/)
      })
    }
  }
}

for (const [platform, field, check] of trustFields) {
  test(`trusted still rejects valid false for ${platform}.${field}`, () => {
    const metadata = metadataFor('trusted')
    metadata[platform][field] = false
    const { status, result } = runVerifier('trusted', metadata)
    assert.equal(status, 1)
    assert.equal(result.checks[check], false)
    assert.equal(result.trusted, false)
    assert.doesNotMatch(result.failures.join('\n'), /must be a boolean/)
  })
}

test('trusted still requires a Windows manual validation report', () => {
  const { status, result } = runVerifier('trusted', metadataFor('trusted'), '')
  assert.equal(status, 1)
  assert.equal(result.trusted, false)
  assert.match(result.failures.join('\n'), /Windows manual validation report/)
})

for (const platform of ['macos', 'windows']) {
  test(`missing ${platform} metadata still fails closed`, () => {
    const metadata = metadataFor('trusted')
    delete metadata[platform]
    const { status, result } = runVerifier('trusted', metadata)
    assert.equal(status, 1)
    assert.equal(result.trusted, false)
    assert.match(result.failures.join('\n'), /Missing .* metadata file/)
  })
}
