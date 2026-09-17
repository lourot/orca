/** Decides whether a run gets a precheck at all, and against which host — separate
 *  from `precheck-runner.ts`, which only knows how to spawn one. */
import type {
  Automation,
  AutomationPrecheckResult,
  AutomationRun
} from '../../shared/automations-types'
import { runAutomationPrecheck } from './precheck-runner'
import type { AutomationRunTargetResult } from './run-target-resolution'

/** Null when this run has no precheck to run: manual triggers skip it by design. */
export async function runAutomationRunPrecheck(input: {
  automation: Automation
  run: AutomationRun
  target: AutomationRunTargetResult
}): Promise<AutomationPrecheckResult | null> {
  const { automation, run, target } = input
  const precheck = automation.precheck
  if (run.trigger !== 'scheduled' || !precheck) {
    return null
  }
  if (!target.ok) {
    const at = Date.now()
    return {
      command: precheck.command,
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
      error: target.error,
      startedAt: at,
      completedAt: at
    }
  }
  return await runAutomationPrecheck({
    precheck,
    target:
      automation.executionTargetType === 'ssh'
        ? { type: 'ssh', cwd: target.cwd, connectionId: automation.executionTargetId }
        : { type: 'local', cwd: target.cwd }
  })
}
