# Duplicating automations

Choose **Duplicate** from an Orca automation's actions menu or right-click menu.
The copy is created immediately on the same host and project, named `Name (copy)`
or the next available numbered variant. Rename it through **Edit**.

All configurable settings are preserved, including its enabled or paused state,
schedule and timezone, agent arguments, precheck, workspace target, setup choice,
session mode (Fresh, Reuse or Skip if open), whether a Fresh session closes
when the run finishes, and run guards. An enabled copy
follows its schedule independently.
Existing workspace targets, including folder workspaces, remain the same target.

The copy has a new identity, timestamps and empty run history. Its next run is
calculated from the saved schedule; previous dispatches and missed occurrences are
not copied. Editing either automation does not change the other.

Duplication requires a reachable host that supports scoped automation creation
and retry-safe requests. If a response is lost, retrying while the Automations
page remains open reuses the same creation request and its original settings.
To copy settings edited after a failed attempt, reopen the Automations page and
check whether a copy already exists before duplicating again. A new page or app
session starts a new request.

Externally managed OpenClaw jobs cannot be duplicated through this menu.
