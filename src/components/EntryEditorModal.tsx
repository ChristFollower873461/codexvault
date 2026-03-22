import { type FormEvent, useRef, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { entryStatuses, type EntryUpsertInput, type VaultEntryRecord } from '../lib/types'

const baseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  provider: z.string().trim().min(1, 'Provider is required'),
  envVarName: z
    .string()
    .trim()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, digits, and underscores only'),
  modelFamily: z.string().optional(),
  models: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
  environment: z.string().optional(),
  agentAccessTags: z.string().optional(),
  status: z.enum(entryStatuses),
})

type EntryEditorValues = z.infer<typeof baseSchema>

interface EntryEditorModalProps {
  mode: 'create' | 'edit'
  entry: VaultEntryRecord | null
  onClose: () => void
  onSubmit: (input: EntryUpsertInput) => Promise<void>
}

function splitCsv(input: string | undefined) {
  return (input ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export function EntryEditorModal({
  mode,
  entry,
  onClose,
  onSubmit,
}: EntryEditorModalProps) {
  const secretValueRef = useRef<HTMLInputElement | null>(null)
  const [secretError, setSecretError] = useState<string | null>(null)
  const defaultValues: EntryEditorValues = {
    name: entry?.name ?? '',
    provider: entry?.provider ?? '',
    envVarName: entry?.envVarName ?? '',
    modelFamily: entry?.modelFamily ?? '',
    models: entry?.models.join(', ') ?? '',
    tags: entry?.tags.join(', ') ?? '',
    notes: entry?.notes ?? '',
    environment: entry?.environment ?? '',
    agentAccessTags: entry?.agentAccessTags.join(', ') ?? '',
    status: entry?.status ?? 'active',
  }
  const form = useForm<EntryEditorValues>({
    resolver: zodResolver(baseSchema),
    defaultValues,
  })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const isValid = await form.trigger()
    if (!isValid) {
      return
    }

    const values = form.getValues()
    const rawSecretValue = secretValueRef.current?.value ?? ''
    const hasSecretValue = rawSecretValue.trim().length > 0

    setSecretError(null)

    if (mode === 'create' && !hasSecretValue) {
      setSecretError('Secret value is required for new entries')
      return
    }

    await onSubmit({
      id: entry?.id,
      name: values.name.trim(),
      provider: values.provider.trim(),
      envVarName: values.envVarName.trim(),
      secretValue: hasSecretValue ? rawSecretValue : undefined,
      modelFamily: values.modelFamily?.trim() || undefined,
      models: splitCsv(values.models),
      tags: splitCsv(values.tags),
      notes: values.notes?.trim() ?? '',
      environment: values.environment?.trim() ?? '',
      agentAccessTags: splitCsv(values.agentAccessTags),
      status: values.status,
    })

    if (secretValueRef.current) {
      secretValueRef.current.value = ''
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true">
        <div className="panel-header">
          <div>
            <span className="eyebrow">{mode === 'create' ? 'Create' : 'Edit'}</span>
            <h2>{mode === 'create' ? 'New vault entry' : 'Update entry'}</h2>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="panel-note">
          Metadata and secret values are handled separately on purpose. Secret replacement
          is always explicit.
        </p>

        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Name</span>
            <input
              {...form.register('name')}
              autoFocus
              placeholder="Primary OpenAI key"
            />
            <small>{form.formState.errors.name?.message}</small>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Provider</span>
              <input {...form.register('provider')} placeholder="OpenAI" />
              <small>{form.formState.errors.provider?.message}</small>
            </label>

            <label className="field">
              <span>Env var name</span>
              <input
                {...form.register('envVarName')}
                placeholder="OPENAI_API_KEY"
              />
              <small>{form.formState.errors.envVarName?.message}</small>
            </label>
          </div>

          <label className="field">
            <span>{mode === 'create' ? 'Secret value' : 'Replace secret value'}</span>
            <input
              ref={secretValueRef}
              name="secretValue"
              type="password"
              aria-label={mode === 'create' ? 'Secret value' : 'Replace secret value'}
              placeholder={
                mode === 'create'
                  ? 'sk-...'
                  : 'Leave blank to keep the current secret'
              }
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onInput={() => {
                if (secretError) {
                  setSecretError(null)
                }
              }}
            />
            <small className={secretError ? undefined : 'field-hint'}>
              {secretError ??
                (mode === 'edit'
                  ? 'Leave blank to keep the current secret unchanged.'
                  : 'Required for new entries. The value stays masked until reveal or copy.')}
            </small>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Model family</span>
              <input {...form.register('modelFamily')} placeholder="gpt-4.1" />
            </label>

            <label className="field">
              <span>Status</span>
              <select {...form.register('status')}>
                {entryStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Models</span>
              <input
                {...form.register('models')}
                placeholder="gpt-4.1, gpt-4.1-mini"
              />
              <small className="field-hint">Comma-separated list.</small>
            </label>
            <label className="field">
              <span>Tags</span>
              <input {...form.register('tags')} placeholder="prod, billing" />
              <small className="field-hint">Comma-separated list.</small>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Environment</span>
              <input {...form.register('environment')} placeholder="production" />
            </label>
            <label className="field">
              <span>Agent access tags</span>
              <input
                {...form.register('agentAccessTags')}
                placeholder="writer, monitor"
              />
            </label>
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea
              {...form.register('notes')}
              rows={5}
              placeholder="Rotation notes, usage guidance, or provider context"
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              {mode === 'create' ? 'Add entry' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
