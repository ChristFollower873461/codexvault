import { useEffect, useEffectEvent } from 'react'

interface IdleLockOptions {
  enabled: boolean
  timeoutMs: number
  onLock: () => void
}

export function useIdleLock({ enabled, timeoutMs, onLock }: IdleLockOptions) {
  const onLockEvent = useEffectEvent(onLock)

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) {
      return undefined
    }

    let timerId = 0
    const resetTimer = () => {
      window.clearTimeout(timerId)
      timerId = window.setTimeout(() => {
        onLockEvent()
      }, timeoutMs)
    }

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'keydown',
      'pointerdown',
      'focus',
      'scroll',
    ]

    events.forEach((eventName) =>
      window.addEventListener(eventName, resetTimer, { passive: true }),
    )
    resetTimer()

    return () => {
      window.clearTimeout(timerId)
      events.forEach((eventName) =>
        window.removeEventListener(eventName, resetTimer),
      )
    }
  }, [enabled, timeoutMs])
}
