# Messages

Messages lists local `orca terminal send` text across workspaces, including refused
and failed sends. The log retains 14 days and displays the latest 500 entries.

The sidebar icon turns yellow when the latest entry is unseen and less than
72 hours old. Opening Messages or pressing Refresh acknowledges the entries
successfully loaded. A failed load does not clear the highlight.

The indicator checks message metadata every 30 seconds while the sidebar entry
and window are visible, and on window focus. New arrivals while Messages is open
highlight the icon again; press Refresh to load and acknowledge them. The list
does not refresh automatically. Acknowledgement survives app restarts within the
same profile.
