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

## Status-bar tap to scroll to top

Probed on 2026-10-13 in the iOS 26.5 Simulator (iPhone 17 Pro, Safari) with a
throwaway page, tapping the status bar beside the Dynamic Island. A plain page
scrolled 2,000 px returned to the top. A page that also contained any
`overflow-y: auto` element did nothing at all: neither the page nor the inner
scroller moved, whether or not the inner scroller sat under the status bar. This
matches UIKit's rule that the gesture is ignored when more than one scroll view
on screen opts in, since WebKit gives every overflow scroller its own native
scroll view. A page in a `position: fixed` full-screen frame with no inner
scroller still scrolled, so the fixed frame is not the obstacle. The usual web
workaround (keep the page scrolled by an offset and treat a scroll back to zero
as the tap) also failed for 1 px and 100 px offsets even without an inner
scroller; only the 2,000 px offset fired. On the user's phone, taps on the
status bar and island never reached the page, so the header's top padding cannot
catch them either. Getting the system gesture would therefore require the
document itself to be the only scroll view on every tab, replacing
`.app-content` as the scroll surface.
