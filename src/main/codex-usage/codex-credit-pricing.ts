import { normalizeModelForPricing } from './codex-model-pricing'

type CodexCreditPricing = {
  input: number
  cachedInput: number
  output: number
}

const CREDIT_PRICING: Record<string, CodexCreditPricing> = {
  'gpt-5.4-mini': { input: 18.75, cachedInput: 1.875, output: 113 },
  'gpt-5.4': { input: 62.5, cachedInput: 6.25, output: 375 },
  'gpt-5.5': { input: 125, cachedInput: 12.5, output: 750 },
  'gpt-5.6-sol': { input: 100, cachedInput: 10, output: 500 },
  'gpt-5.6-terra': { input: 50, cachedInput: 5, output: 300 },
  'gpt-5.6-luna': { input: 5, cachedInput: 0.5, output: 30 }
}

/** Estimates ChatGPT credits using the standard published token rates. */
export function estimateCredits(
  model: string | null,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
): number | null {
  const normalized = normalizeModelForPricing(model)
  const pricing = normalized ? CREDIT_PRICING[normalized] : undefined
  if (!pricing) {
    return null
  }
  const cached = Math.min(cachedInputTokens, inputTokens)
  const uncachedInput = Math.max(inputTokens - cached, 0)
  return (
    (uncachedInput * pricing.input + cached * pricing.cachedInput + outputTokens * pricing.output) /
    1_000_000
  )
}
