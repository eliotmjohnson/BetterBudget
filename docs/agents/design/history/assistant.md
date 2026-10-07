# Better Buddy: history

The investigations and superseded builds behind the rules in `../assistant.md`.
Read a section here before reverting or reworking the rule it explains.

## Opening and closing the chat

The seat-and-return animations replaced a script-driven flight of a ghost copy
between the launcher and the seat, which handed off between separately animated
copies and on iOS Safari froze and jumped the spin when the freshly mounted seat
was revealed mid-turn.

## Keyboard fit

### The capped body and the thread's reserve (until 6.0.4)

Until 6.0.4 the reserve was the thread's `min-height` and the body was capped at
the reserve plus the composer's block, so the sheet stayed the same height
however long the conversation got and left room to rise when the keyboard
opened. The user found two long replies scrolling inside that 380 px box
needlessly small, and with the keyboard up the thread's reserve, with the
messages at its top, left a large blank gap between the last message and the
composer. `stickToEnd` also skipped a body whose content fit (`scrollTop > 0`),
which kept it from gliding into that blank end. 6.0.4 moved the reserve to the
sheet's `min-height`, uncapped the body, and anchored the messages to the
composer.

### The section before it was trimmed

The Keyboard fit section as it stood in 6.0.2, including the tuning that was
tried and reverted (the 400 ms grow, the 440 and 380 ms end glides), the
measurements behind the 13 px padding, and the chat's own keyboard layout that
5.13.4 replaced.

Below 760 px the chat is the standard raised sheet, pinned by its top edge like
every other half sheet and sized to its content up to the screen height less the
status bar plus 6 px, so with the keyboard up its top rises 6 px into the status
bar. The thread reserves `--assistant-reserve`, `min(42dvh, 380px)`
(`min(52dvh, 460px)` at 760 px and wider), so the chat opens roomy and does not
grow with every reply, and the body is capped at that reserve plus the
composer's block, so a long conversation scrolls inside it instead of opening
the sheet to its full cap: it then has room to rise when the keyboard opens, as
the other half sheets do. The reserve was 460 px on phones until 5.13.4 and was
lowered at the user's request. The composer is a `StillTextarea`
(`budget-and-inputs.md`) inside `.sheet-body`, after the thread, with
`position: sticky` at the body's bottom and the old footer's border, padding,
and white background (the body drops its own bottom padding, and the body's cap
adds the composer's 91 px plus the bottom safe area to the reserve). It must not
be in the sheet's `footer`: with the keyboard up, iOS would not scroll the
thread at all while the focused field sat outside the scroll container. Touch
events reached the messages and nothing cancelled them, yet the thread never
moved; reproduced in the iOS Simulator's installed web app in September 2026,
where a field placed inside the body and focused let the thread scroll, and
every other sheet, whose fields all sit inside its body, scrolled normally. The
body's `overscroll-behavior-y` is `none`, so it never rubber-bands: iOS bounces
a scroll container's whole content, the stuck composer with it, and keeping the
bounce for the messages alone would need the composer outside the scroll
container, which is what stopped the thread scrolling. The composer passes
`reveal={false}`, since a field stuck to the body's bottom is always in view:
the shared reveal otherwise lent the body the keyboard's height in scroll room
and scrolled by it, which carried the composer up under the header. The keyboard
is handled by the shared `useKeyboardFit` (`sheets-and-menus.md`): the chat
passes `followKeyboard`, so while the composer has focus its inset rises in one
motion on the keyboard's own `raise` curve, while the sheet's height, set in
pixels, eases straight to where that inset sizes it on the keyboard's 440 ms
`grow` motion (`keyboard-fit/follow.ts`; a 400 ms version was tried and reverted
at the user's request), so its top settles smoothly instead of stopping dead at
its cap, its body gives up the rest, and the composer rides up with the
keyboard; the shared staging (grow on `grow`, then take the rest from the body
in 100 ms) left the composer behind the keyboard for about half a second after
the keyboard had stopped. The chat's bottom padding is the inset less the bottom
safe area and 13 px (`max(0px, …)`), so with the keyboard up the composer's
safe-area padding sits behind the keyboard and the gap between the field and the
keyboard's floating toolbar matches the 12 px above the field (13 pt above and
14 pt below, measured in the Simulator), while the keyboard-down look is
unchanged; and the shared shield covers anything under the keyboard's glass.
`stickToEnd` in `stick-to-end.ts`, attached by the end marker's ref callback,
keeps a body resting on the latest message there as the body gets shorter, so
the newest messages stay in view as the keyboard opens. It glides to the end
over 360 ms, the keyboard's own length but on an ease-out of its own, quicker
than the sheet's 440 ms rise (440 and 380 ms were tried first and read as slow),
re-reading the end each frame while the body shrinks, rather than holding it at
once, which moved the messages up as fast as the keyboard; the newest message
slides in behind the composer, and a touch on the body stops the glide; a body
scrolled up the conversation, or one whose content fits, is left alone, and
nothing happens as the body lengthens again, which `useKeyboardFit` settles.
Until 5.13.4 the chat opted out with its own keyboard layout
(`keyboard-layout.ts`): it stayed pinned by `bottom: 0`, measured the whole
conversation to animate its `height` to the content plus the keyboard's cover,
grew to the full screen below the status bar for a long conversation, tightened
its spacing, and glided the thread to its end. Measuring by removing the height
dropped the thread to the top for a frame each time the keyboard opened, so it
visibly jumped back and glided down. It was replaced by the shared fit at the
user's direction; replacing it alone did not restore scrolling, which needed the
composer moved into the body.

Before 5.13.3 the composer was a plain textarea and the chat relied on iOS
Safari's own page slide, which scrolled the document by the keyboard's height
and carried the bottom-anchored sheet up, while the hook only shrank the sheet's
height to the visible area over 520 ms on `cubic-bezier(0.32, 0.72, 0, 1)` after
a 60 ms delay chosen so the slide always led. A recording of that build in the
iOS Simulator's installed web app (September 2026) showed the page and its
header sliding up under the status bar before the chat stretched, the motion
every other field had already lost. Moving the sheet's `top`, a per-frame
height, and a stand-in focus field were each tried with that older approach and
dropped; the still-focus stand-in that now parks the composer while the keyboard
opens is the shared one, with the composer's own native focus otherwise
unchanged.

### Status bar fill, corners, and grabber (until 5.13.4)

This and the next section describe the chat's own keyboard layout, which 5.13.4
replaced with the shared fit. The status bar above the sheet is filled white by
a solid, unblurred copy of the sheet drawn as its first `box-shadow`, offset up
by the inset less the overlap (inside the continuous-corners clip, which bleeds
120 px), and that offset transitions from zero with the height, so the fill
rises with the sheet. Do not fill the status bar with animated top padding
instead: that version pushed the content down while the sheet rose and, against
Safari's own keyboard slide, read on device as heavy bouncing; the resting chat
keeps a zero-offset white shadow so the two lists interpolate. Corners go square
while full and switch instantly, since `border-radius` is not in the transition,
so they round again the moment the keyboard starts closing; transitioning them
was tried and dropped because the continuous-corners painter writes the radius
it paints back as an inline `border-radius`, which pins a `border-radius`
transition. The grabber collapses (height, bottom margin, and opacity) on the
`grow` curve, 440 ms on `cubic-bezier(0.2, 1, 0.45, 1)`, while the keyboard is
up and returns as it closes. The hook also eases the thread to the latest
message over the same duration (`glideToEnd`, a frame loop that closes the
starting distance from the end on an ease-out cubic while re-reading the scroll
range each frame, since the sheet resizes at the same time; an instant jump read
as abrupt, and a smooth scroll after the resize felt worse than one during it),
and keeps pinning the end for 80 ms (`PIN_TAIL_MS`) after its ease, because a
scroll that finished before the resize let the last frames uncover the latest
message and jump. `fit` measures both ends because CSS cannot transition out of
a content-sized height.

### Keyboard guards (until 5.13.4)

Inline styles go on the chat sheet only, never on `body`; nothing runs while the
sheet is being dragged, springs back, or is swiped away (the composer's caret
hides during the drag and a release that dismisses blurs it,
`sheets-and-menus.md`), and the hook re-checks when the finger lifts and once
the spring has finished for anything it skipped; the inline transition is
removed after each change so it never overrides the sheet's drag-settle
transition; and the behavior applies only below 760 px, so resizing a desktop
window never restyles the centered modal.
