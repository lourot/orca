/** OpenCode agent for headless text generation: every tool is denied, so a prompt can only yield text. */
export const OPENCODE_TEXT_ONLY_AGENT = 'orca-text-only'

// Why: the stock `build` agent let a branch-name prompt call worktree_create, shell and MCP tools.
export const OPENCODE_TEXT_ONLY_RUN_ARGS = ['--agent', OPENCODE_TEXT_ONLY_AGENT]

const DESCRIPTION = 'Orca text generation without tools'

/** Agent file Orca installs beside its status plugin, so OpenCode's shared background service knows the agent. */
export const OPENCODE_TEXT_ONLY_AGENT_FILE = `${OPENCODE_TEXT_ONLY_AGENT}.md`

export const OPENCODE_TEXT_ONLY_AGENT_SOURCE = [
  '---',
  `description: ${DESCRIPTION}`,
  'mode: primary',
  'hidden: true',
  'permission:',
  '  "*": deny',
  '---',
  ''
].join('\n')

/** The same agent as inline config, for a private server (`--standalone`) when the file is missing. */
export const OPENCODE_TEXT_ONLY_CONFIG_CONTENT = JSON.stringify({
  agent: {
    [OPENCODE_TEXT_ONLY_AGENT]: {
      description: DESCRIPTION,
      mode: 'primary',
      hidden: true,
      permission: { '*': 'deny' }
    }
  }
})
