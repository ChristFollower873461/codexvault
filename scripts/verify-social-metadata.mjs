import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const publicUrl = 'https://vault.basementboys.org/'
const imageUrl = `${publicUrl}og.png`

function projectUrl(path) {
  return new URL(`../${path}`, import.meta.url)
}

function readProjectFile(path) {
  return readFileSync(projectUrl(path))
}

function metadataDocument() {
  const markup = readProjectFile('index.html').toString('utf8')
  return new JSDOM(markup).window.document
}

function metaContent(document, attribute, value) {
  return document.querySelector(`meta[${attribute}="${value}"]`)?.getAttribute('content')
}

function pngDimensions(path) {
  const image = readProjectFile(path)
  assert.deepEqual(Array.from(image.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10])
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  }
}

test('publishes canonical Open Graph and Twitter card metadata', () => {
  const document = metadataDocument()

  assert.equal(document.querySelector('link[rel="canonical"]')?.getAttribute('href'), publicUrl)
  assert.equal(metaContent(document, 'property', 'og:type'), 'website')
  assert.equal(metaContent(document, 'property', 'og:site_name'), 'CodexVault')
  assert.equal(metaContent(document, 'property', 'og:url'), publicUrl)
  assert.equal(metaContent(document, 'property', 'og:image'), imageUrl)
  assert.equal(metaContent(document, 'property', 'og:image:width'), '1200')
  assert.equal(metaContent(document, 'property', 'og:image:height'), '630')
  assert.match(metaContent(document, 'property', 'og:image:alt') ?? '', /fake sample credentials/)
  assert.equal(metaContent(document, 'name', 'twitter:card'), 'summary_large_image')
  assert.equal(metaContent(document, 'name', 'twitter:image'), imageUrl)
  assert.match(metaContent(document, 'name', 'twitter:image:alt') ?? '', /fake sample credentials/)
})

test('ships correctly sized, bounded raster sharing assets', () => {
  assert.deepEqual(pngDimensions('public/og.png'), { width: 1200, height: 630 })
  assert.ok(statSync(projectUrl('public/og.png')).size < 1_000_000)
  assert.deepEqual(pngDimensions('public/apple-touch-icon.png'), { width: 180, height: 180 })
})

test('robots permits public search and retrieval but denies dedicated training', () => {
  const trainingTokens = [
    'GPTBot', 'ClaudeBot', 'CCBot', 'Bytespider', 'Google-Extended',
    'Applebot-Extended', 'Amazonbot', 'meta-externalagent',
  ]
  // Pin the complete static policy so no extra group can override public access
  // and no sitemap is advertised for an endpoint this demo does not publish.
  const expected = [
    'User-agent: *\nAllow: /\nContent-Signal: search=yes,ai-input=yes,ai-train=no',
    ...trainingTokens.map((token) => `User-agent: ${token}\nDisallow: /`),
  ].join('\n\n') + '\n'

  assert.equal(readProjectFile('public/robots.txt').toString('utf8'), expected)
})
