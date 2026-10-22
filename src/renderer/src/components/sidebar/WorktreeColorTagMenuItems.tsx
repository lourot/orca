import React, { useCallback, useRef, useState } from 'react'
import { Slash } from 'lucide-react'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  resolveWorkspaceColorTagSelection,
  WORKSPACE_COLOR_TAG_SWATCHES
} from '../../../../shared/workspace-color-tag'

/** Swatch identity: null clears the tag, a hex assigns it. */
type SwatchOption = string | null

// The empty slot leads, so the presets read as one strip after it.
const SWATCH_OPTIONS: readonly SwatchOption[] = [null, ...WORKSPACE_COLOR_TAG_SWATCHES]

type WorktreeColorTagMenuItemsProps = {
  colorTag: string | null
  /** The selection carries more than one tag state; nothing reads as checked. */
  mixed: boolean
  disabled: boolean
  isMultiContext: boolean
  /** Workspaces carrying each tag, the right-clicked ones included, keyed by normalized hex. */
  colorTagUsage: ReadonlyMap<string, number>
  onAssignColorTag: (colorTag: string | null) => void
}

function getSwatchLabel(swatch: SwatchOption, isSelected: boolean, usage: number): string {
  if (swatch === null) {
    return translate('auto.components.sidebar.WorktreeColorTagMenuItems.noColor', 'No color')
  }
  const action = isSelected
    ? translate(
        'auto.components.sidebar.WorktreeColorTagMenuItems.removeColor',
        'Remove color {{value0}}',
        { value0: swatch }
      )
    : translate(
        'auto.components.sidebar.WorktreeColorTagMenuItems.useColor',
        'Use color {{value0}}',
        { value0: swatch }
      )
  if (usage === 0) {
    return action
  }
  const usedBy = translate(
    'auto.components.sidebar.WorktreeColorTagMenuItems.usedBy',
    'used by {{count}} workspaces',
    { count: usage }
  )
  return `${action}, ${usedBy}`
}

export function WorktreeColorTagMenuItems({
  colorTag,
  mixed,
  disabled,
  isMultiContext,
  colorTagUsage,
  onAssignColorTag
}: WorktreeColorTagMenuItemsProps): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(SWATCH_OPTIONS.indexOf(colorTag), 0)
  )
  // Why: the row is one menu stop, so the swatch a click or Enter lands on has to
  // survive into the item's onSelect without waiting for a state re-render.
  const activeIndexRef = useRef(activeIndex)

  const isSwatchSelected = useCallback(
    (swatch: SwatchOption): boolean => (mixed ? false : swatch === colorTag),
    [colorTag, mixed]
  )

  const moveActiveIndex = useCallback((index: number) => {
    const wrapped = (index + SWATCH_OPTIONS.length) % SWATCH_OPTIONS.length
    activeIndexRef.current = wrapped
    setActiveIndex(wrapped)
  }, [])

  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return
      }
      // Why: horizontal arrows belong to the row; letting them bubble would close
      // the menu or jump to a sibling submenu instead of moving between swatches.
      event.preventDefault()
      event.stopPropagation()
      moveActiveIndex(activeIndexRef.current + (event.key === 'ArrowRight' ? 1 : -1))
    },
    [moveActiveIndex]
  )

  const handleSelect = useCallback(() => {
    onAssignColorTag(
      resolveWorkspaceColorTagSelection(colorTag, SWATCH_OPTIONS[activeIndexRef.current])
    )
  }, [colorTag, onAssignColorTag])

  const groupLabel = isMultiContext
    ? translate(
        'auto.components.sidebar.WorktreeColorTagMenuItems.groupColorMulti',
        'Group color for selected workspaces'
      )
    : translate('auto.components.sidebar.WorktreeColorTagMenuItems.groupColor', 'Group color')
  // Why: focus stays on the row while arrows move between swatches, so the row's own name has to
  // say which swatch Enter will activate or a screen reader hears only "Group color".
  const getUsage = (swatch: SwatchOption): number =>
    swatch === null ? 0 : (colorTagUsage.get(swatch) ?? 0)
  const activeSwatch = SWATCH_OPTIONS[activeIndex] ?? null
  const rowLabel = `${groupLabel}: ${getSwatchLabel(activeSwatch, isSwatchSelected(activeSwatch), getUsage(activeSwatch))}`

  return (
    <DropdownMenuItem
      disabled={disabled}
      className="px-2 py-1.5 focus:bg-transparent dark:focus:bg-transparent"
      onSelect={handleSelect}
      onKeyDown={handleRowKeyDown}
      aria-label={rowLabel}
    >
      <div className="flex w-full items-center justify-between gap-0.5 pt-3.5" role="radiogroup">
        {SWATCH_OPTIONS.map((swatch, index) => {
          const isSelected = isSwatchSelected(swatch)
          const usage = getUsage(swatch)
          return (
            <button
              key={swatch ?? 'none'}
              type="button"
              role="radio"
              tabIndex={-1}
              aria-checked={isSelected}
              aria-label={getSwatchLabel(swatch, isSelected, usage)}
              data-workspace-color-swatch={swatch ?? 'none'}
              onPointerEnter={() => moveActiveIndex(index)}
              onClick={() => {
                activeIndexRef.current = index
              }}
              className={cn(
                // Why: every swatch carries a border so the absolutely placed count, which is
                // offset from the padding edge, sits at the same height on all of them.
                'relative flex size-4 shrink-0 items-center justify-center rounded-full border outline-none transition-shadow',
                swatch === null || swatch === '#ffffff'
                  ? 'border-border text-muted-foreground'
                  : 'border-transparent',
                isSelected && 'ring-2 ring-foreground ring-offset-2 ring-offset-popover',
                !isSelected &&
                  index === activeIndex &&
                  'ring-1 ring-muted-foreground ring-offset-2 ring-offset-popover'
              )}
              style={swatch === null ? undefined : { backgroundColor: swatch }}
            >
              {swatch === null ? <Slash className="size-2.5" /> : null}
              {usage > 0 ? (
                <span
                  aria-hidden
                  data-workspace-color-usage
                  className="absolute -top-4 left-1/2 -translate-x-1/2 text-3xs leading-none tabular-nums text-muted-foreground"
                >
                  {usage > 9 ? '9+' : usage}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </DropdownMenuItem>
  )
}
