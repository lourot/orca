const externalEventGenerations = new WeakMap<Event, number>()
let externalEventGenerationCounter = 0

/** One increasing generation per event, shared by watcher and explicit reloads so a newer read wins. */
export function getExternalEventGeneration(event: Event): number {
  const existing = externalEventGenerations.get(event)
  if (existing !== undefined) {
    return existing
  }
  const generation = ++externalEventGenerationCounter
  externalEventGenerations.set(event, generation)
  return generation
}
