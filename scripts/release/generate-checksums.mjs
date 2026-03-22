#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

function argValue(flag, fallback = '') {
  const index = process.argv.indexOf(flag)
  if (index === -1) {
    return fallback
  }
  return process.argv[index + 1] ?? fallback
}

function walkFiles(directory) {
  const results = []
  for (const fileName of fs.readdirSync(directory)) {
    const fullPath = path.join(directory, fileName)
    const stats = fs.statSync(fullPath)
    if (stats.isDirectory()) {
      results.push(...walkFiles(fullPath))
      continue
    }
    results.push(fullPath)
  }
  return results
}

function sha256(filePath) {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

const inputDir = argValue('--input-dir')
const outputPath = argValue('--output')

if (!inputDir || !outputPath) {
  console.error(
    'Usage: node generate-checksums.mjs --input-dir <dir> --output <file>',
  )
  process.exit(1)
}

const absoluteInputDir = path.resolve(inputDir)
if (!fs.existsSync(absoluteInputDir)) {
  console.error(`Input directory not found: ${absoluteInputDir}`)
  process.exit(1)
}

const files = walkFiles(absoluteInputDir)
  .filter((filePath) => !filePath.endsWith('.json'))
  .sort((left, right) => left.localeCompare(right))

if (files.length === 0) {
  console.error(`No files found for checksum generation in ${absoluteInputDir}`)
  process.exit(1)
}

const lines = files.map((filePath) => {
  const digest = sha256(filePath)
  const relativePath = path.relative(absoluteInputDir, filePath)
  return `${digest}  ${relativePath}`
})

const absoluteOutputPath = path.resolve(outputPath)
fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true })
fs.writeFileSync(absoluteOutputPath, `${lines.join('\n')}\n`, 'utf8')

console.log(`Wrote checksums for ${files.length} files to ${absoluteOutputPath}`)
