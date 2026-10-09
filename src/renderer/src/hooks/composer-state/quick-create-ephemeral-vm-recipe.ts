import { useCallback } from 'react'
import type { ComposerModel } from './composer-model'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'

type EphemeralVmRecipeInput = Pick<
  ComposerModel,
  | 'ephemeralVmRecipes'
  | 'ephemeralVmsEnabled'
  | 'selectedEphemeralVmRecipeId'
  | 'selectedWorkspaceTarget'
>

type EphemeralVmRecipeResolution = {
  activeEphemeralVmRecipeId: string | null
  ephemeralVmRecipe: WorktreeCreationRequest['ephemeralVmRecipe']
}

/** Returns a stable resolver for a quick create's ephemeral VM recipe; none when VMs are off or the target is not ready. */
export function useQuickCreateEphemeralVmRecipe(
  input: EphemeralVmRecipeInput
): (repoId: string) => EphemeralVmRecipeResolution {
  const {
    ephemeralVmRecipes,
    ephemeralVmsEnabled,
    selectedEphemeralVmRecipeId,
    selectedWorkspaceTarget
  } = input
  return useCallback(
    (repoId: string): EphemeralVmRecipeResolution => {
      const activeEphemeralVmRecipeId = ephemeralVmsEnabled ? selectedEphemeralVmRecipeId : null
      if (!activeEphemeralVmRecipeId || selectedWorkspaceTarget.status !== 'ready') {
        return { activeEphemeralVmRecipeId, ephemeralVmRecipe: undefined }
      }
      const selectedRecipe = ephemeralVmRecipes.find(
        (recipe) => recipe.id === activeEphemeralVmRecipeId
      )
      return {
        activeEphemeralVmRecipeId,
        ephemeralVmRecipe: {
          sourceRepoId: repoId,
          recipeId: activeEphemeralVmRecipeId,
          projectId: selectedWorkspaceTarget.target.projectId,
          ...(selectedRecipe?.checkoutMode ? { checkoutMode: selectedRecipe.checkoutMode } : {})
        }
      }
    },
    [ephemeralVmRecipes, ephemeralVmsEnabled, selectedEphemeralVmRecipeId, selectedWorkspaceTarget]
  )
}
