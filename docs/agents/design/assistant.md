# Better Buddy

Read this before changing the Better Buddy launcher, its throw, fall, and
spaceship, or the chat sheet. `AGENTS.md` owns the assistant's server and
prompt-caching rules.

## Launcher

### Launcher and dock

The Better Buddy launcher is the 64 px robot icon
(`src/components/assistant/better-buddy.png`, transparent, no backing disc) over
a soft cornflower halo and a floor shadow, fixed against the left or right edge,
and rendered in the app frame rather than inside `.app-content`, whose entrance
animation transforms its children. Until someone moves him he starts docked left
at the lowest height the clamp allows, just above the bottom navigation: on the
right he covered the amounts column, the swipe-revealed delete button, and his
own Settings switch. On desktop a left-docked launcher clears the 190 px
sidebar, and from 1100 px the budget layout widens to at most 1200 px but always
leaves 50 px of gutter on each side (`min(1200px, 100% - 100px)` in
`responsive-motion.css`) so the docked launcher never covers item names; narrow
that gutter only together with the launcher's dock.

### Drag and throw

A press that moves more than 8 px becomes a drag: the button follows the pointer
with an inline transform and no transition, and on release it is thrown:
`launcher-throw.ts` measures the release velocity with the shared
`gesture-release.ts` helpers (capped at 4 px/ms), projects where it would coast
under a 0.995-per-millisecond deceleration, and settles against the side edge
nearer that landing point at the landing height, which CSS then clamps. The
settle is a damped spring (stiffness 200, damping ratio 0.78) that starts at the
drop offset with the release velocity and is sampled once per frame into a
linear Web Animation on `transform`, so Better Buddy carries the fling and lands
with a few pixels of overshoot. Velocity toward the resting spot is capped at
the offset times the spring frequency, and velocity away from it at 1,000 px/s,
so a throw into a clamp or an edge bounces rather than overshooting off screen.
Pressing Better Buddy mid-settle catches him where he is: the animation is
cancelled, its current transform is held inline, and a new drag continues from
there, while a tap without a drag settles him from that spot again. Reduced
motion skips the projection and the settle.

### Fall and protest

A throw released at 3 px/ms or faster makes him fall over and protest.
`buddy-protest.tsx` runs a 2.2 s Web Animation (`buddy-tumble`) on the
`transform` of the launcher's `.buddy-figure-body`, the wrapper between the
figure and the image, pivoting at 90% of its height so he is knocked onto his
side toward his own screen edge during the settle, his head reaching slightly
past it, lands with a small bounce, wriggles, then hops back upright with a
slight overshoot; it is on the image rather than the button because the button's
`transform` belongs to the settle and its `translate` and `rotate` to the arrive
and leave animations, rather than the whole `.buddy-figure` so the halo and
floor shadow stay upright on the floor beneath him instead of turning with him,
and rather than the image because the image's `rotate: y` spin applies outside
its own `transform`: a fall there, caught mid-spin while he faced backwards, was
mirrored and he tipped toward the wrong side. The wrapper also carries the
spin's perspective, since perspective only reaches direct children. The fall
starts by restarting the float, spin, and shadow cycles together (`restartIdle`
in `better-buddy-figure.tsx` sets each animation's `currentTime` to zero), which
snaps him to the bottom of his hover and face-on during the fast first beat, and
`data-tumbling` then pauses all three like a drag does until the fall ends, so
he neither hovers nor spins on the floor; the spin cycle's 6.2 s rest is still
ahead when he stands. That moves the launcher's cycles off the timeline-aligned
phase the seat starts on, as a drag's pause already does. A second
`buddy-tumble` animation on the figure's `::after` (`pseudoElement`) fades the
floor shadow out as he falls and back in as he stands, through
`filter: opacity()`, because the shadow's own `buddy-shadow` animation owns
`opacity` and a script animation over it would snap back to the paused value
when it ended. A browser that ignores `pseudoElement` would fade the whole
figure instead, so the fade is cancelled when its effect reports no
pseudo-element. Opening the chat cancels both. Pausing and resuming the float on
the image and the shadow on the figure's `::after` can restart them a frame
apart, so when a drag or a fall ends, `resyncFloorShadow` in
`better-buddy-figure.tsx` waits for both to be running again and sets the
shadow's `startTime` to the float's; they share the 3.6 s duration, so equal
start times keep the shadow shrinking exactly as he rises.

### Speech bubble

It also shows a speech bubble: a cornflower (`--blue`) capsule with white text,
a soft blue drop shadow, and an iMessage-style curved tail (a
`clip-path: path()` on `::after`, mirrored with `scale` on the left) at its
lower corner nearest him, its bottom level with his middle on the side facing
the screen, opted out of continuous corners so it stays a true capsule, with one
of a few lines (never the same one twice in a row: the hook remembers the last
line after the bubble clears, not just while it shows), popping in with a slight
overshoot and fading out over 2.2 s. A second bubble animation
(`buddy-protest-tilt`, on `transform`) swings it 40° up around his center like a
clock hand, clockwise on the right and counterclockwise on the left, so it tips
its far end up while staying the same distance from him (`--buddy-protest-tilt`:
40deg on the right and -40deg on the left, since CSS angles turn clockwise). Its
`transform-origin` is his center, 30 px past its near edge (it overlaps the 64
px launcher by 2 px) and level with its bottom (`bottom: 50%`), which also makes
the pop-in grow out of him. It swings on the same beats as the fall (there by
16%, back from 72% to 86%), so it tips up while he is down and levels as he
stands. The bubble is a child of the launcher so it rides the settle animation,
is `aria-hidden` and ignores pointers because it is decorative, and clears when
the chat opens. Reduced motion never measures a throw, so he never falls or
protests.

### Spaceship

Holding him near the top of the screen calls his spaceship (`buddy-ship.tsx`,
styles in `assistant-ship.css`): once he has been held for a full second
(`HOLD_MS`, counted from the press) and his center has been in the top 36% of
the viewport for at least 180 ms (`ZONE_DELAY_MS`), so repositioning him near
the top or flicking him through that band never summons it, while a drag that
has already lasted a second gets the ship almost as soon as he reaches the band,
a 150 px ship drops in from above to hover top-center, 12 px below the safe area
so it overlaps the header rather than hanging below it (24 px at 760 px and
wider, centered on the content beside the 190 px sidebar); dragging him back
below 46% sends it away, the gap between the two keeping it from flickering at
the edge, bobbing on a 2.4 s loop with the picture's own beam pulsing beneath
it. The art is two aligned transparent PNGs cut from the approved image at the
same 384 × 376 canvas, centered on the hatch so the whole saucer fits:
`better-buddy-ship.png` (hull, beam removed) and `better-buddy-ship-beam.png`
(the beam alone, un-blended from the off-white background), so the beam can
brighten, widen, and retract on its own; the hatch sits at 50% × 66.5% of the
canvas, which is the beam's `transform-origin`. The ship is mounted, hidden,
once the launcher has arrived, so its images load in the background before the
first drag, and it sits at z-index 41, above the launcher, so Better Buddy
passes behind the hull and under the translucent beam. Holding his center at the
bottom of the beam (within 40 px of the hatch's column, from 80% of the canvas
height, just above where the beam ends at about 96%, to 44 px below the canvas)
targets the ship, so he boards only from there, never from higher in the beam:
the beam goes fully bright and the ship grows 5%. Releasing there boards him: he
rises 10 px, then shrinks to 12% and fades while flying to the hatch over 950 ms
(a Web Animation on the button that holds its end state), the beam retracts into
the hatch over 240 ms, and the ship dips and tilts, then accelerates off the
top-right corner over 740 ms. Then `onBeamUp` turns Better Buddy off through the
Settings preference and shows a toast (Better Buddy flew home. Bring him back in
Settings.) with **Undo**, which turns him back on so he flies in again as on
launch. Releasing anywhere else sends the ship back up over 420 ms and settles
him as usual. With reduced motion, releasing in the beam turns him off at once.

### Click suppression, idle motion, and position

When a drag ends, a one-shot capture-phase listener swallows the next click
anywhere in the page for 600 ms and the touch end is cancelled, because a
browser synthesizes a click at the drop point that would otherwise activate the
control beneath Better Buddy or reopen the chat. The halo and floor shadow are
gradients on `BetterBuddyFigure` pseudo-elements, never a `drop-shadow` filter,
which clips at the image box. The robot floats with a 3.6 s up-and-down loop
while the floor shadow shrinks and fades in step, and on an independent 10 s
cycle it rests, then turns around on its vertical axis twice
(`rotate: y 720deg`, under a perspective of five figure widths) over the last
3.8 s. Every Better Buddy animation pauses while dragging. The launcher stays
hidden until the browser is idle after hydration plus 600 ms, then flies in from
its edge with a slight overshoot using the individual `translate` and `rotate`
properties, which leaves `transform` free for dragging and the drop settle. The
global reduced-motion rule reduces the float and the flight to their end states.
The side and height are stored per browser as `betterBudgetAssistantPosition`
(`side:fraction-of-viewport-height`), and CSS clamps the resting height
(`--assistant-launcher-top`, then applied as a `bottom` offset,
`--viewport-height` minus that top minus his size, so he is anchored from the
bottom edge like the bottom navigation; anchored by `top`, he alone dropped
about 40 px in the frame before iOS shifted the page for a focused field that
needed it, while the bottom-anchored navigation stayed put, and he did not drop
for a field that needed no shift) between just below the header bar
(`--assistant-launcher-top-reserve`, 6 px under it; 76 px below the safe area at
760 px and wider) and the mobile bottom navigation, so rotation and resizing
never strand it. It sits above page content and the bottom navigation and below
the sync indicator and sheets.

### Opening and closing the chat

Editing a Budget-row planned amount on a touch screen sends him off and back the
same way (`budget-and-inputs.md`, Floating chrome while editing). Opening the
chat sends Better Buddy running off his own screen edge (`buddy-leave`, 380 ms,
a slight wind-up away from the edge first, fading only on the last frame), and
he then slides into a 44 px seat beside the sheet title (`titleAdornment`) from
beyond the chat's left edge, which the sheet's `overflow: hidden` clips, after a
380 ms delay, as the sheet settles, so he seems to have run over
(`buddy-seat-in`, 720 ms: 400 ms to a small overshoot, then 320 ms easing
upright on `cubic-bezier(0.45, 0, 0.35, 1)`). Closing the chat drops
`data-away`, which swaps the launcher's animation back to `buddy-arrive`, so he
flies back in from his edge as on launch, but after a 280 ms delay
(`data-returning='after-sheet'`) so he comes back while the 0.6 s sheet exit is
finishing rather than as the chat starts leaving. A drag dismissal reports the
close only after its velocity-matched exit has carried the sheet off screen, so
the sheet's `onDragDismissStart` fires on release, as that exit begins, and the
launcher returns then with `data-returning='now'` and no delay, alongside the
departing sheet. `data-away` is its own state rather than the sheet's `open`, so
Better Buddy can come home before the sheet reports the close. The launch
arrival (`buddy-arrive`) is 1.1 s: 648 ms to the overshoot, then 452 ms easing
upright on the same gentle curve, set as the overshoot keyframe's own
`animation-timing-function`, because the element-level curve applies to every
keyframe segment and its fast start snapped him upright. Both are CSS animations
on the individual `translate` and `rotate` properties of the launcher and the
seat wrapper, never on `.buddy-figure-art`, so the float and spin keep running.
Do not fly a ghost copy between the launcher and the seat by script: on iOS
Safari the hand-off froze and jumped the spin. Every copy's float, spin, and
shadow still start at the document timeline's origin (`startTime = 0`), so the
launcher and the seat share a pose. Reduced motion removes the seat's and the
return's delays along with the durations.

### Chat sheet

The chat itself uses the standard raised sheet titled Better Buddy, with no
visible close button, like every sheet (drag, overlay, and Escape dismiss it),
making room for the keyboard exactly as every other sheet does
(`useKeyboardFit`, below), **New chat** as the header action once a conversation
exists, a greeting and suggestions in its empty state, new messages animating in
(the person's from the bottom right, Better Buddy's replies and the typing
indicator from the bottom left, each a short rise, fade, and scale on a slight
spring overshoot, using the individual `translate` and `scale` properties);
messages already present when the sheet opens are recorded at mount by
`TranscriptMessages` and never replay; reopening at the latest message (a stable
ref callback on the end marker sets the sheet body's `scrollTop` when the sheet
mounts, instantly rather than smoothly), and the composer stuck to the bottom of
the sheet body. A new message or the typing indicator showing or hiding is
handled by `MessageGlide` (`message-glide.tsx`), the message list: it puts the
body on its very end at once (its `scrollHeight`, not the end marker into view,
which left the newest message under the stuck composer), then slides the
messages from where they sat to where that leaves them, over 440 ms on the
keyboard's `cubic-bezier(0.2, 1, 0.45, 1)` (a `transform` Web Animation on the
list, from the measured offset to none), so they rise the same way whether the
conversation fits, grows the sheet, or scrolls (history: Message arrival). When
the sheet grows, its height eases from the old size over the same motion while
the body stays on its end, so its top rises with the messages; a sheet whose
height keyboard fit has set in pixels is left alone. It is a class component
because `getSnapshotBeforeUpdate` is the only way to read where the messages sat
before React committed the change. Do not bring back a smooth scroll alongside
it: the slide's offset adds scroll room below the list, so a scroll to the end
would chase it and move the messages twice. Reduced motion keeps the jump to the
end and skips both animations. Closing the sheet returns focus to the launcher.
Below 760 px an overlay tap, Escape, or any other non-drag close slides the chat
out over 0.6 s on `cubic-bezier(0.45, 0, 0.25, 1)` with the overlay fading in
step, instead of the shared 0.45 s sheet exit, whose curve starts at full speed
and read as abrupt with no finger motion behind it; the rules key off the seat
with `:has()` in `assistant.css`, and a drag dismissal still sets its own
matched exit. The composer uses a 16 px font so iOS does not zoom on focus. The
send button is a plain `type='button'` using `focusKeepingPress`
(`budget-and-inputs.md`, under Operator bar), so sending keeps the composer
focused and the keyboard up; a drag that starts on the button, such as scrolling
the thread, does not send.

### Keyboard fit

Below 760 px the chat is the standard raised sheet, pinned by its top edge like
every other half sheet. With the keyboard down it is sized to its content up to
108 px below the mobile header bar, 80 px shorter than the `capped-mobile` Add
transaction sheet's 28 px, so the month header and the top of the page stay in
view however long the conversation (history: The focused height). While the
composer has focus with the keyboard up (the sheet carries `data-keyboard-fit`),
its `min-height` and `max-height` are both its full height, the screen height
less the status bar plus 6 px (`--assistant-full-height`), so the focused chat
always opens all the way, however short the conversation, and its top rises 6 px
into the status bar. Just before the attribute is set, `holdHeight`
(`keyboard-fit/follow.ts`) holds the sheet at its current height in pixels with
an inline `min-height: 0` and `max-height: none`, because either limit outranks
a set height (history: The focused height). `followKeyboard` then measures the
sheet with the attribute set and the hold lifted, so the rise eases to full
height on the keyboard's motion; the attribute is removed before the lowering
measure, so the sheet eases back to its content size, and the hold is cleared
with the rest of the fit. The sheet's `min-height` is `--assistant-reserve`,
`min(42dvh, 380px)`, plus the 95 px header block and the composer's block (91 px
plus the bottom safe area), so the chat opens roomy and a short conversation
does not grow it with every reply. Its selector names the `raised-mobile`
variant so it outranks that variant's `min(310px, 52dvh)` minimum in
`responsive-motion.css`, which loads later and otherwise wins on equal
specificity. At 760 px and wider the thread itself keeps a `min(52dvh, 460px)`
minimum instead. The body is uncapped, so a long conversation grows the sheet to
its cap rather than scrolling inside a 380 px box, which the user found
needlessly small. The body is a flex column that fills the sheet, the thread
grows to fill the body above the composer, and the messages take
`margin-top: auto`, so any spare room sits above them and the newest message
always rests just over the composer. Because the reserve lives on the sheet, not
the thread, the keyboard's inset (inside the sheet's border-box) takes up the
reserve, and a short conversation stays snug against the composer with the
keyboard up instead of leaving the reserve's empty space between the messages
and the field.

The composer is a `StillTextarea` (`budget-and-inputs.md`) inside `.sheet-body`,
after the thread, with `position: sticky` at the body's bottom and the old
footer's border, padding, and white background (the body drops its own bottom
padding). It must not be in the sheet's `footer`: with the keyboard up, iOS
would not scroll the thread at all while the focused field sat outside the
scroll container (reproduced in the iOS Simulator). The body's
`overscroll-behavior-y` is `none`, so it never rubber-bands: iOS bounces a
scroll container's whole content, the stuck composer with it, and keeping the
bounce for the messages alone would need the composer outside the scroll
container, which is what stopped the thread scrolling. The composer passes
`reveal={false}`, since a field stuck to the body's bottom is always in view:
the shared reveal otherwise lent the body the keyboard's height in scroll room
and scrolled by it, which carried the composer up under the header.

The keyboard is handled by the shared `useKeyboardFit` (`sheets-and-menus.md`):
the chat passes `followKeyboard`, so while the composer has focus its inset
rises in one motion on the keyboard's own `raise` curve, while the sheet's
height, set in pixels, eases straight to where that inset sizes it on the
keyboard's 440 ms `grow` motion (`keyboard-fit/follow.ts`), so its top settles
smoothly instead of stopping dead at its cap, its body gives up the rest, and
the composer rides up with the keyboard. The shared staging (grow, then take the
rest from the body in 100 ms) would leave the composer behind the keyboard. The
chat's bottom padding is the inset less the bottom safe area and 13 px
(`max(0px, …)`), so with the keyboard up the composer's safe-area padding sits
behind the keyboard and the gap between the field and the keyboard's floating
toolbar matches the 12 px above the field, while the keyboard-down look is
unchanged; and the shared shield covers anything under the keyboard's glass.

`stickToEnd` in `stick-to-end.ts`, attached by the end marker's ref callback,
keeps a body resting on the latest message there as the body gets shorter, so
the newest messages stay in view as the keyboard opens. It glides to the end
over 360 ms, the keyboard's own length but on an ease-out of its own, quicker
than the sheet's 440 ms rise, re-reading the end each frame while the body
shrinks, rather than holding it at once, which moved the messages up as fast as
the keyboard; the newest message slides in behind the composer, and a touch on
the body stops the glide; a body scrolled up the conversation is left alone (one
whose content fits counts as resting on the end, so a conversation the keyboard
pushes past the body's height still glides to its newest message), and nothing
happens as the body lengthens again, which `useKeyboardFit` settles. The
still-focus stand-in that parks the composer while the keyboard opens is the
shared one, with the composer's own native focus otherwise unchanged.
