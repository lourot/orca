# Running ahead of schedule

An enabled automation with a cooldown shows a green Play button beside its next-run time when:

- The next scheduled run is in the future, less than one cooldown away.
- Its last actual dispatch was more than one cooldown before that scheduled run, or it has never dispatched.

For example, with a 16-hour cooldown and the next run in 10 hours, the button appears if the last dispatch was over 16 hours before that scheduled run. At either exact cooldown boundary it stays hidden. Skipped occurrences do not count as dispatches.

The tooltip is **Run ahead of schedule**. This uses Run Now with the same host availability and overlap checks. The button is disabled while the request is pending or the target is unavailable.

The saved schedule stays unchanged. Once the early run dispatches, the button disappears and cooldown suppresses the upcoming scheduled occurrence. An attempt that never dispatches does not consume that occurrence. The button's timing updates with the page's minute clock.

External-provider rows have no Orca cooldown and do not show this button.
