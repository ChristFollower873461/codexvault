#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

function argValue(flag, fallback = '') {
  const index = process.argv.indexOf(flag)
  if (index === -1) {
    return fallback
  }
  return process.argv[index + 1] ?? fallback
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

const channel = argValue('--channel')
const metadataDir = argValue('--metadata-dir')
const outputPath = argValue('--output')
const windowsValidationReport = argValue('--windows-validation-report')

if (!channel || !metadataDir || !outputPath) {
  console.error(
    'Usage: node verify-release-truth.mjs --channel <preview|partial|trusted> --metadata-dir <dir> --output <file> [--windows-validation-report "<text>"]',
  )
  process.exit(1)
}

if (channel !== 'preview' && channel !== 'partial' && channel !== 'trusted') {
  console.error(
    `Unsupported channel "${channel}". Use "preview", "partial", or "trusted".`,
  )
  process.exit(1)
}

const absoluteMetadataDir = path.resolve(metadataDir)
if (!fs.existsSync(absoluteMetadataDir)) {
  console.error(`Metadata directory not found: ${absoluteMetadataDir}`)
  process.exit(1)
}

const metadataFiles = fs
  .readdirSync(absoluteMetadataDir)
  .filter((fileName) => fileName.endsWith('.json'))
  .sort()

if (metadataFiles.length === 0) {
  console.error(`No metadata JSON files found in ${absoluteMetadataDir}`)
  process.exit(1)
}

const metadata = metadataFiles.map((fileName) =>
  readJson(path.join(absoluteMetadataDir, fileName)),
)
const macos = metadata.find((entry) => entry.platform === 'macos')
const windows = metadata.find((entry) => entry.platform === 'windows')
const checks = {
  macosSigned: Boolean(macos?.signed),
  macosNotarized: Boolean(macos?.notarized),
  windowsSigned: Boolean(windows?.signed),
}

const failures = []
if (!macos) {
  failures.push('Missing macOS metadata file.')
}
if (!windows) {
  failures.push('Missing Windows metadata file.')
}

if (channel === 'partial') {
  if (!checks.macosSigned) {
    failures.push('Partial release requires signed macOS artifact.')
  }
  if (!checks.macosNotarized) {
    failures.push('Partial release requires notarized macOS artifact.')
  }
}

if (channel === 'trusted') {
  if (!checks.macosSigned) {
    failures.push('Trusted release requires signed macOS artifact.')
  }
  if (!checks.macosNotarized) {
    failures.push('Trusted release requires notarized macOS artifact.')
  }
  if (!checks.windowsSigned) {
    failures.push('Trusted release requires signed Windows artifact.')
  }
  if (!windowsValidationReport.trim()) {
    failures.push(
      'Trusted release requires a Windows manual validation report reference.',
    )
  }
}

let trustTier = 'preview'
if (channel === 'trusted' && failures.length === 0) {
  trustTier = 'trusted-cross-platform'
} else if (channel === 'partial' && failures.length === 0) {
  trustTier = 'partial-macos-trusted'
}

function macosLabel() {
  if (checks.macosSigned && checks.macosNotarized) {
    return 'macOS (Signed + Notarized)'
  }
  return 'macOS (Unsigned Preview)'
}

function windowsLabel() {
  if (checks.windowsSigned) {
    return 'Windows (Signed)'
  }
  return 'Windows (Unsigned Preview / Early Access)'
}

function releaseNotesLabel() {
  if (trustTier === 'trusted-cross-platform') {
    return 'Trust status: Fully trusted cross-platform.'
  }
  if (trustTier === 'partial-macos-trusted') {
    return 'Trust status: Partial. macOS artifacts are signed and notarized. Windows artifacts are unsigned preview.'
  }
  return 'Trust status: Preview. Artifacts are unsigned/unnotarized unless explicitly stated otherwise.'
}

const result = {
  generatedAt: new Date().toISOString(),
  channel,
  trusted: channel === 'trusted' && failures.length === 0,
  trustTier,
  windowsManualValidationReport: windowsValidationReport.trim() || null,
  checks,
  platformLabels: {
    macos: macosLabel(),
    windows: windowsLabel(),
  },
  releaseNotesLabel: releaseNotesLabel(),
  mustNotClaim: [
    'Fully trusted cross-platform release when windowsSigned is false.',
    'Windows signed/trusted when windowsSigned is false.',
    'All artifacts are production-trustworthy unless trustTier is trusted-cross-platform.',
  ],
  platformTrust: {
    macosTrusted: checks.macosSigned && checks.macosNotarized,
    windowsTrusted: checks.windowsSigned,
  },
  failures,
  artifacts: metadata,
}

const absoluteOutputPath = path.resolve(outputPath)
fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
fs.writeFileSync(
  absoluteOutputPath,
  `${JSON.stringify(result, null, 2)}\n`,
  'utf8',
)

if (failures.length > 0) {
  console.error('Release truth verification failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Release truth verified for channel "${channel}".`)
