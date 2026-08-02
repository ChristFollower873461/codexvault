import { describe, expect, it } from 'vitest'

import {
  getDemoSnapshot,
  previewDemoExport,
  revealDemoSecret,
} from './demoVault'

describe('browser demo vault', () => {
  it('contains only an explicit read-only sample session', () => {
    const snapshot = getDemoSnapshot()

    expect(snapshot.mode).toBe('demo')
    expect(snapshot.recentVaults).toEqual([])
    expect(snapshot.session?.currentPath).toBe('Browser memory · fake data only')
    expect(snapshot.session?.entries).toHaveLength(5)
    expect(
      snapshot.session?.entries.every((entry) => entry.id.startsWith('demo-')),
    ).toBe(true)
  })

  it('reveals unmistakably fake values and rejects missing sample ids', () => {
    expect(revealDemoSecret('demo-openai-primary')).toContain('not_a_real_key')
    expect(() => revealDemoSecret('missing')).toThrow(/sample entry does not exist/i)
  })

  it('reproduces deterministic OpenClaw priority without exporting revoked entries', () => {
    const bundle = JSON.parse(
      previewDemoExport(
        [
          'demo-openai-primary',
          'demo-openai-legacy',
          'demo-groq-sandbox',
          'demo-github-revoked',
        ],
        'openClawBundle',
      ),
    ) as {
      env: Record<string, string>
      providers: Array<{ entryId: string }>
      skipped: Array<{ entryId: string; reason: string }>
    }

    expect(bundle.env.OPENAI_API_KEY).toBe(
      'demo_openai_primary_not_a_real_key',
    )
    expect(bundle.env.GROQ_API_KEY).toBe('demo_groq_sandbox_not_a_real_key')
    expect(bundle.env.GITHUB_TOKEN).toBeUndefined()
    expect(bundle.providers.map((entry) => entry.entryId)).not.toContain(
      'demo-openai-legacy',
    )
    expect(bundle.skipped).toContainEqual(
      expect.objectContaining({
        entryId: 'demo-openai-legacy',
        reason: 'shadowedByHigherPriorityEntry',
      }),
    )
    expect(bundle.skipped).toContainEqual(
      expect.objectContaining({
        entryId: 'demo-github-revoked',
        reason: 'revoked',
      }),
    )
  })
})
