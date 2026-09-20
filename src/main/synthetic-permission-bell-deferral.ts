type Timer = ReturnType<typeof setTimeout>

/** Owns one cancellable per-pane timer for Orca-fabricated permission BELs. */
export function createSyntheticPermissionBellDeferral(options: { quietMs: number }) {
  const timers = new Map<string, Timer>()

  function cancel(paneKey: string): void {
    const timer = timers.get(paneKey)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(paneKey)
    }
  }

  return {
    arm(paneKey: string, emitBell: () => void): void {
      cancel(paneKey)
      const timer = setTimeout(() => {
        timers.delete(paneKey)
        emitBell()
      }, options.quietMs)
      timer.unref?.()
      timers.set(paneKey, timer)
    },
    cancel,
    cancelAll(): void {
      for (const paneKey of timers.keys()) {
        cancel(paneKey)
      }
    },
    filterPendingBellFacts(batch: TerminalSideEffectBatch): TerminalSideEffectBatch {
      if (
        !batch.paneKey ||
        !timers.has(batch.paneKey) ||
        !batch.facts.some((fact) => fact.kind === 'bell')
      ) {
        return batch
      }
      return {
        ...batch,
        facts: batch.facts.filter((fact) => fact.kind !== 'bell')
      }
    },
    hasPending(paneKey: string): boolean {
      return timers.has(paneKey)
    }
  }
}
