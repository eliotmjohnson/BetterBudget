# Shell and platform: history

The investigations and superseded builds behind the rules in
`../shell-and-platform.md`. Read a section here before reverting or reworking
the rule it explains.

## Viewport height

An interim version also shifted every bottom-anchored surface down by
`calc(100lvh - 100dvh)`; that was zero at rest but became the status bar's
height whenever iOS briefly shrank `100dvh` as the keyboard opened, which
animated the Better Buddy chat's bottom edge on its own timer and made the
composer and title bounce.

## Late inset on launch

A fixed 59 px stand-in, the common Dynamic Island inset, was considered for the
first launch and not used, because it moves the header whenever the phone's real
inset differs.

An earlier version hid the page on every launch until the inset arrived; a slow
launch then showed as a white pause each time.

## Field focus on touch

The Income expected amount snapped both ways until 5.11.3, because it is not a
`.field` input and was missing from the fade's selector list.

## Scroll surface and month slide

Before `freezeIntrinsicSizes`, a fresh clone's off-screen categories fell back
to the 170 px placeholder, the snapshot came out hundreds of pixels shorter than
the page, and the restored scroll position was clamped, so the outgoing month
visibly jumped when the arrow was pressed far down a long budget. Including the
padding and borders left each copy a pixel too tall until it painted, and
Chrome's scroll anchoring then moved the snapshot by the difference.
