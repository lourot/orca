import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { StatsSummary } from '../../../../shared/process-stats-types'
import { buildProjectActivityViews, type ProjectActivityView } from '@/lib/project-activity-view'

export type StatsSlice = {
  statsSummary: StatsSummary | null
  fetchStatsSummary: () => Promise<void>
  /** Null until the first fetch succeeds; then projects absent from it had no recent agent turn. */
  projectActivityByRepoId: Record<string, ProjectActivityView> | null
  fetchProjectActivity: () => Promise<void>
}

export const createStatsSlice: StateCreator<AppState, [], [], StatsSlice> = (set, get) => ({
  statsSummary: null,
  projectActivityByRepoId: null,

  fetchStatsSummary: async () => {
    try {
      const summary = await window.api.stats.getSummary()
      set({ statsSummary: summary })
    } catch (err) {
      console.error('Failed to fetch stats summary:', err)
    }
  },

  fetchProjectActivity: async () => {
    try {
      const views = buildProjectActivityViews(
        await window.api.stats.getProjectActivity(),
        Date.now()
      )
      // Why compare: this is polled, and a fresh object would re-render every project header.
      if (JSON.stringify(views) !== JSON.stringify(get().projectActivityByRepoId)) {
        set({ projectActivityByRepoId: views })
      }
    } catch (err) {
      console.error('Failed to fetch project activity:', err)
    }
  }
})
