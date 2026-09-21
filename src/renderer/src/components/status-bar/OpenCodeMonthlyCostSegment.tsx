import type { OpenCodeMonthlyCost } from '../../../../shared/opencode-usage-types'
import { OpenCodeGoIcon } from './icons'
import { translate } from '@/i18n/i18n'

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value)
}

function formatPercent(value: number | null): string {
  return value === null ? '--' : `${value.toFixed(1)}%`
}

export function OpenCodeMonthlyCostSegment({
  usage,
  compact = false,
  iconOnly = false
}: {
  usage: OpenCodeMonthlyCost
  compact?: boolean
  iconOnly?: boolean
}): React.JSX.Element {
  const cost = usage.estimatedCostUsd === null ? '--' : formatUsd(usage.estimatedCostUsd)
  const cap = formatUsd(usage.monthlyCapUsd)
  const estimateLabel = translate(
    'auto.components.status.bar.StatusBar.openCodeMonthlyCostLabel',
    'Monthly estimate from ccusage'
  )
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground"
      title={`OpenCode: ${estimateLabel} · ${cost} / ${cap} · ${formatPercent(usage.usedPercent)}`}
    >
      <OpenCodeGoIcon size={13} />
      {!compact && !iconOnly ? <span className="font-medium text-foreground">OpenCode</span> : null}
      {!iconOnly ? (
        <span className="tabular-nums">
          ~{cost} / {cap}
        </span>
      ) : null}
    </span>
  )
}

export function OpenCodeMonthlyCostRow({
  usage,
  onSelect
}: {
  usage: OpenCodeMonthlyCost
  onSelect: () => void
}): React.JSX.Element {
  const cost = usage.estimatedCostUsd === null ? '--' : formatUsd(usage.estimatedCostUsd)
  const cap = formatUsd(usage.monthlyCapUsd)
  const estimateLabel = translate(
    'auto.components.status.bar.StatusBar.openCodeMonthlyCostLabel',
    'Monthly estimate from ccusage'
  )
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-none px-3.5 py-2.5 text-left hover:bg-accent"
      title={`OpenCode: ${estimateLabel}`}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-secondary">
        <OpenCodeGoIcon size={13} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        OpenCode
        <span className="block text-[11px] font-normal text-muted-foreground">{estimateLabel}</span>
      </span>
      <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
        ~{cost} / {cap} · {formatPercent(usage.usedPercent)}
      </span>
    </button>
  )
}
