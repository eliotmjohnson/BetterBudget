# Shell and platform

Read this before changing the app frame, bottom navigation, continuous corners,
safe areas, the PWA touch guards, pull-to-refresh, page entrances, the landscape
phone layout, the rotate-to-portrait prompt, or the iPhone Duo launch images.

## Bottom navigation

### Material

The mobile bottom navigation is a floating Liquid Glass-style capsule, inset
from the screen edges and lifted above the home indicator, rather than an
edge-attached bar. Safari exposes no native glass or backdrop refraction to web
content, so the material is layered by hand: a lightly tinted translucent fill,
a light `backdrop-filter` blur with saturation so content stays visible through
the bar, a top specular sheen, and a light-catching gradient rim stroked along
the continuous outline (a masked CSS rim until that outline is measured), with
an opaque fallback where `backdrop-filter` is unsupported. The glass lives on
its own `.bottom-nav-surface` layer rather than on the nav: the
continuous-corner clip-path makes its element a backdrop root, so on the nav
itself it would blank the blur. Write only the unprefixed `backdrop-filter` and
`mask`: Tailwind's Lightning CSS generates the `-webkit-` forms, and a
hand-written prefixed declaration after the standard one replaces it in the
output, leaving Chromium with no blur at all.

### Active-tab lens

A single glass lens pill marks the active tab and slides between tabs on a
spring curve with slight overshoot, squash-stretching as it travels. It must not
stretch on first render, only on a tab change. Pressing the active tab swells
the lens; tab icons never scale on press. The bar's inner width snaps to a
multiple of 4 and its left edge to a whole pixel with CSS `round()`, so every
tab edge and lens stop lands on a whole pixel; a half-pixel split lets the lens
and tab layers round in different directions, visibly off-center on a phone.
Tabs are not link-draggable, and the lens and tabs keep permanent compositing
layers (`will-change: transform`) so icons do not re-snap by half a pixel while
the lens animates. Reduced motion removes the slide and stretch.

### Load and sizing

The bar and lens use continuous corners (below), and the bar waits offscreen
until its shape is measured, then slides up on load; only `transform` animates,
because opacity below 1 would make the nav a backdrop root and flash the glass
clear. `--bottom-nav-height` is the capsule's full footprint including its
bottom offset; content padding, scroll padding, the toast offset, and drag edge
auto-scroll all derive from it or from the nav's measured top.

### Shadow and outline on iOS

WebKit does not clip a `backdrop-filter` to a clip-path, so on iOS the blur
painted the plain circular capsule and showed as a light rim past the smoothed
ends; the surface therefore also carries a mask of its continuous outline
(`continuousMask`), which WebKit does apply to the blur. That mask would cut off
a shadow on the surface itself, so the drop shadow lives on a sibling
`.bottom-nav-shadow` layer behind it: a plain `box-shadow` inset 1 px, so the
shadow starts under the smoothed edge instead of leaving an unshadowed sliver
between the edge and the circular shadow, and opted out of the native
superellipse, which squared its ends in Chromium. The outline's hairline is a 6
% `ContinuousStroke` drawn along the curve, not a `0 0 0 0.5px` box-shadow ring,
which followed the circle and hid the capsule smoothing entirely. Do not draw
that shadow with an SVG blur or a `drop-shadow` filter on a filled copy of the
outline: iOS Safari clipped the SVG blur to a rectangle, and the filled copy's
antialiased edge leaked a dark line along the ends.

## Continuous corners

### Tokens and native corners

Corners are continuous (curvature-smoothed) with one curve drawn two ways, set
by three tokens in `tokens.css`: `--corner-superellipse` (1.8; higher is
smoother and squarer), `--corner-extent` (1.55; how far past the authored radius
the curve reaches, higher is rounder), and `--capsule-smoothing` (0.3) for pill
ends. Apple's own corner is about superellipse 1.38 at extent 1.24, which at
this app's sizes is within a fraction of a pixel of a plain circle, so the app
deliberately runs more continuous than that. Where the browser draws
`corner-shape` natively (Chromium today), one `@supports` rule gives every
element the superellipse and sets `--corner-radius-scale` to the extent; every
rectangular `border-radius` is therefore authored as
`calc(Npx * var(--corner-radius-scale))`, and new ones must be too, while
circles (`50%`) and pills (`999px`) stay literal. That native path is the whole
story there, desktop Chrome included: the script below stands down
(`drawsCornersNatively` in `attach.ts`), so sheets, buttons, and cards are drawn
by CSS with one antialiased edge and shadows that follow the curve. Elsewhere,
Safari on iPhone and Mac today, the scale stays 1, plain CSS corners are
circles, and the script draws the continuous ones.

### Script-drawn corners

In browsers without native `corner-shape` (Safari today), continuous corners
come from `src/components/ui/continuous-corners/`: `useContinuousCorners` for
the tab bar and lens, the Budget and Income summary cards, the hold menu, and
every sheet's surface, and `ContinuousControls`, mounted once in
`providers.tsx`, which attaches to every element matching its button selector
list (primary and soft buttons, the Expense/Income segmented control and its
thumb, filter tabs, the icon, tone, and organizer action buttons, the sheet
header submit, the month picker control and its month cells, and the toast
action) as they enter the DOM. Add a class to that list when a new button style
needs continuous corners. The tab bar and lens pass `outline: true` and keep the
script even where corners are native, because `ContinuousStroke` draws their rim
from its computed outline. Both apply the same superellipse and extent (their
elements keep a scale of 1), or a capsule end when the radius fills a side. The
element paints the largest circular radius that contains the curve and its
clip-path removes only the slivers between that circle and the curve, so
shadows, focus rings, and contents keep painting normally. Each sliver stops
exactly on the painted circle. Where the circle's antialiased edge meets the
clip's, a faint line survives along each corner, visible only when zoomed in; it
is left alone on purpose. 6.5.0 pushed the slivers 0.5 px past the circle to
hide it, but that also cut the first half pixel of each control's shadow, and a
shadow offset downward is strongest right under the bottom edge, so shadowed
buttons such as the Transactions **Add** showed a white line along their lower
corners; 6.5.1 reverted it. Sheets avoid the line another way (see Sheet
surface). A CSS border stays and is also stroked along the curve as a background
layer, re-read whenever a state attribute, hover, or border transition changes
it. That layer is `!important`, because component state rules restyle with the
`background` shorthand, which would reset it at any specificity. The border
color must be opaque so the two do not double up, and a bordered continuous
element must use `background-color` rather than a background image.

### Mechanics

The mechanics, all in `src/components/ui/continuous-corners/`: `geometry.ts`
first mirrors CSS by shrinking radii that overflow a side together by one
factor, then scales each by the extent. A corner whose scaled radius fills a
whole side becomes a capsule end, whose curvature ramps linearly from zero (a
clothoid) through the `--capsule-smoothing` share of its 90° turn along the
longer edge and then holds as a circular arc; every other corner is the
`superellipse(K)` curve with exponent 2^K, exactly what `corner-shape` draws.
`attach.ts` sizes from the ResizeObserver border-box size, which is fractional
and ignores transforms: `offsetWidth` rounds, and the half-pixel error was
visible at the tab bar's 4 px gaps. The script applies to Safari only, so check
script-path changes in Chromium by making `CSS.supports` report no
`corner-shape` before the page loads. `useContinuousCorners` returns a callback
ref, so an element that remounts (the lens replays its stretch by remounting) is
re-attached, and `ContinuousControls` skips elements a hook already manages.
`ContinuousStroke` draws a gradient rim inside the outline for surfaces that
have no CSS border, which is how the tab bar and lens get their light-catching
edges.

### Constraints

A decorative shape attached this way must be a real element, not a
pseudo-element, which is why the segmented control's thumb is a `<span>`. The
clip applies to the element's whole subtree, so anything overhanging a
continuous element's corner must be its sibling, not its child: the Transactions
filter count badge sits beside the filter button in a positioned wrapper for
that reason. A radius scaled past half an element's side becomes a circle or
pill end, and one that nearly reaches it leaves almost no straight edge: a small
square control reads as a circle. Keep the authored radius times the extent to
about 85% of half the element's shorter side, which is why the 46 px filter
button, sized to match the search input's height, uses 12 px rather than the
input's 14 px. Circles and pills keep `corner-shape: round`: add any new one to
the opt-out list in `tokens.css`, or the native superellipse will square it off.
`.icon-button` is on that list because icon buttons are circles, so the
square-cornered `.icon-button.bordered-icon` tiles (the Transactions filter and
Recently deleted buttons) get the superellipse back in a rule right after it;
without it they drew plain rounded corners in Chrome beside the squircle pills,
while Safari's script, which lists `.bordered-icon`, already drew them
continuous.

### Sheet surface

A sheet is the one continuous element with a large shadow, and the sliver clip
removes the shadow along with everything else between the curve and the painted
circle, which left a light crescent against the dim at each top corner when
zoomed in. So `sheet.tsx` attaches the corners to `.sheet-surface`, an
`aria-hidden`, `z-index: -1` first child that paints the white, not to
`.sheet-content` itself, with `clipToCurve` (only on the script path; natively
both draw the same curve in CSS): having no shadow and nothing overhanging it,
the surface clips to the curve itself instead of painting the enclosing circle
and clipping the slivers, because there the circle's antialiased edge and the
sliver clip's edge overlap and leave a faint line along the circle.
`.sheet-content` keeps the shadow with a plain radius of the full curve
(`--sheet-radius-top` or `--sheet-radius-bottom` times `--corner-extent`), a
circle that lies wholly inside the superellipse, so the shadow runs right up to
the curve and the surface covers the rest. That only works with
`overflow: visible` on `.sheet-content`, since a clipping radius would cut the
surface back to the circle; on desktop, where all four corners round, its last
child (the body or footer) takes the same bottom radius so scrolled content and
the footer's fill stay inside the curve. Set a variant's corners through those
two custom properties, never `border-radius` on `.sheet-content`.

## Status bar and safe area

### Drawing under the status bar

The installed iOS app draws under the status bar: `appleWebApp.statusBarStyle`
is `black-translucent` with `viewport-fit=cover`, so the page, including the
hold-menu blur and full-screen sheets, reaches the top edge instead of stopping
at an opaque system bar. `env(safe-area-inset-top)` is therefore the status
bar's height in standalone mode, and every top-anchored surface must add it
through the `--safe-area-top` token in `tokens.css`, never through
`env(safe-area-inset-top)` directly (launch race below): the mobile header's top
padding, the navigation-detail header, full-screen sheets, the keyboard-open
chat, the hold-menu layer, Better Buddy's resting clamp, and the sync pill,
which sits `calc(var(--safe-area-top) + 12px)` from the top so it stays 12 px
into the header. A new fixed or sticky element near the top must do the same, or
it will sit under the clock.

### Viewport height

In this mode `height: 100%` on `html` and `body` resolves to the screen minus
the status bar, and while the root is that short iOS also sizes the layout
viewport to match, so `100dvh`, `100svh`, and a fixed element's `bottom: 0` all
stopped a status bar short of the real bottom edge, leaving a white band under
the bottom navigation. `tokens.css` therefore defines `--viewport-height`
(`100dvh`, or `100lvh` under `@media (display-mode: standalone)`, the one unit
that reports the full screen there), and `html`, `body`, the app frame and main
column, the sign-in screen, the navigation detail, and full-screen sheets use
it. Sizing the root that way is what fixes the layout viewport: measured on
device afterwards, `innerHeight` and `100dvh` were the full 874 px from launch
and a fixed `bottom: 0` reached the real edge, so bottom-anchored fixed surfaces
keep their plain `bottom` offsets. Do not base a position on `100lvh - 100dvh`,
which jumps to the status bar's height whenever iOS briefly shrinks `100dvh` as
the keyboard opens, and do not write `100dvh` on a new full-height element; use
`--viewport-height`.

### Short `100lvh` on launch

On an occasional launch of the folded iPhone Duo (iOS 27.2.1), `100lvh` itself
resolved 25 pt short of the 678 pt cover screen while fixed elements still
spanned the full height: the bottom navigation sat in its usual place, but the
root, and with it the scrolling content, ended in a hard line at 653 pt just
under the navigation. The installed app's token is therefore
`max(100lvh, var(--viewport-height-floor, 0px))`, and the inline head script
`viewportFloorScript` (`src/app/safe-area-launch.ts`, installed iOS app only)
measures a fixed `top: 0; bottom: 0` probe against a `100lvh` probe. When the
fixed one is at least 1 px taller it sets `--viewport-height-floor` on `html` to
that height, and otherwise removes it, so a correct launch carries no floor. The
floor is the tallest fixed span seen while the page width holds, so the keyboard
never lowers it, and resets when the width changes (rotation, folding,
unfolding). It measures every frame for 3 s after the page starts or returns to
view (`pageshow`, `visibilitychange`), and on every resize. The floor can only
raise the token, never lower it below `100lvh`. Do not instead make `body` or
`.app-frame` `position: fixed` to reach the bottom: the Radix scroll lock forces
`body` back to `position: relative` whenever a sheet opens, and a fixed frame
becomes a stacking context, so the hold menu's drop to `z-index: 29` would paint
over the bottom navigation.

### Late inset on launch

On an occasional cold launch iOS reports `env(safe-area-inset-top)` as 0 for the
first frame or two, so the header painted on the clock's row and then dropped
about 48 px; a screen recording caught it in production as well as under
`next dev`. `--safe-area-top` is
`max(env(safe-area-inset-top), var(--safe-area-top-launch, 0px))`, and the
inline head script in `src/app/safe-area-launch.ts` (installed app, portrait
only) measures a hidden probe sized by `env()` before the first paint. If iOS
already reports the inset it only saves it; otherwise it sets
`--safe-area-top-launch` on `html` to the height saved in `localStorage` as
`betterBudgetSafeAreaTop` on an earlier launch, so the first frame already has
the real inset. The first launch after installing has nothing saved (Home Screen
apps do not share Safari's storage, and Safari reports a top inset of 0), so
there the script instead sets `data-safe-area-pending` on `html`, and
`tokens.css` keeps `body` hidden and pauses every CSS animation
(`animation-play-state: paused !important`) until it is removed, because the
entrance animations (page blur-in, bottom navigation slide, summary arc) would
otherwise run while hidden and appear half finished. On that launch a late inset
therefore shows as the splash fading to white for a frame or two instead of a
jump. Do not substitute a fixed inset such as 59 px on that launch: it moves the
header whenever the phone's real inset differs. The script then reads the probe
every frame. Once iOS reports the inset it reveals the page and removes the
launch value, since with a saved value the two are equal and removing it moves
nothing, and it saves the real one. It reveals the page after 600 ms regardless
and stops polling after 3 s. Landscape launches skip the fallback, since the top
inset is 0 there. Hiding is limited to the first launch, because hiding on every
launch shows a slow launch as a white pause each time. The folded iPhone Duo's
466 × 678 pt cover screen puts its status bar in an 84 pt strip down the right
edge and reports a top inset of 0, so the script also treats a side status bar
as iOS having reported its insets: it reveals the page and drops any launch
value at once, and records `betterBudgetSideInset` instead of a height. A device
with that record uses the first-launch hold rather than a saved height, because
a height saved on the unfolded screen in portrait (82 px) would otherwise pad
the folded screen's header. On iOS 27.1 (and reportedly 27.3 beta 2) the
installed app draws under the strip and gets a right inset of 84, so the probe
measures the side insets. On iOS 27.2 and 27.2.1 the page is 382 pt beside the
strip with every inset 0 except the bottom, so the script also counts a
phone-sized page (screen under 760 px) at least 44 px narrower than
`screen.width` as a side status bar, ignoring an `innerWidth` of 0. Without
that, a folded launch on 27.2 padded its header by the saved unfolded height for
the full 3 s, or, with nothing saved, hid the page for 600 ms. On a 27.2 cold
launch iOS also lays the page out at the full 466 pt first and narrows it to 382
pt a moment later; a production recording showed one frame of the page at 466 pt
(month title centered on the whole screen, the month-actions button under the
strip) before it snapped narrower, because the 600 ms hold had already ended, or
a side inset reported at full width had counted as settled. So when the script
sees the narrower page it saves `screen.width` as `betterBudgetFencedScreen`,
and a later launch on a screen of that width waits for the narrower page
specifically: an inset alone does not reveal it, no launch value is applied, and
the hold lasts up to 1.5 s instead of 600 ms. If the page never narrows within
the 3 s poll, the record is removed, so an iOS that stops narrowing it (27.1
behavior, reportedly 27.3) costs one 1.5 s hold and then launches as before.
Keying on the screen width keeps the unfolded screen (669 pt) and other iPhones
on the normal path. Until the record exists, a side status bar that shows up
only as an inset reveals the page as before, but the script keeps polling,
without hiding anything, until the page narrows or 3 s pass, so it still learns
the narrower page. 6.13.10 stopped at that inset, and on the folded Duo iOS
reports the inset at full width before it narrows the page, so the record was
never written and every launch still snapped. `html` carries
`suppressHydrationWarning` because the script writes its inline style before
hydration.

## Touch guards, scroll surface, and month slide

### Touch guards

The mobile PWA intentionally disables page zoom, text selection, touch callouts,
document-level pull-to-refresh, and cancelable Safari history gestures beginning
within the leftmost 20 px on any route. The global touch guard must remain
capture-phase and non-passive for touchstart and touchmove, claim non-control
edge touches immediately, preserve normal control taps, and prevent every move
that begins inside the edge strip regardless of direction. Mount it once above
all routes.

### Field focus on touch

On touch screens (`pointer: coarse`), a focused field shows focus with its own
border instead of a ring. The light blue `:focus-visible` outline from
`app-shell.css` is removed for text fields, selects, textareas, and the
allocation picker's checkboxes. The Income expected-amount field loses its halo
too. Bordered fields (`.field` inputs, selects, and textareas, the Transactions
search, the Income expected amount, and the date field's `.date-input-shell`
through `:focus-within`) turn their border to the theme `--blue` over 0.2 s
instead, and back over the same 0.2 s on blur. These rules live in the
`pointer: coarse` block near the end of `responsive-motion.css`, because that
file comes after every area file and so wins over their more specific rules. The
rules use `:focus` rather than `:focus-visible`, because iOS does not always
match `:focus-visible` on a tapped select. Buttons keep their rings, and
fine-pointer devices keep every ring for keyboard users.

### Scroll surface and month slide

The month picker popover hangs from the header's bottom edge.
`.month-picker-shell` is deliberately unpositioned, so the popover's containing
block is the sticky `.mobile-header` and `top: 100%` lands on that header's
bottom border on every viewport, whatever the safe-area inset makes the header's
height. An offset from the picker button instead left it floating a few pixels
below the header. Do not make the shell, the month switcher, or anything between
them and the header positioned.

A press outside the open picker only dismisses it: the press's `pointerdown` is
prevented and `swallowDismissingClick` in `month-picker.tsx` swallows the click
that ends it, in the capture phase on `document`, so the tap that closes the
picker never also activates the row, tab, or button beneath it. The swallow
stands down at the next press, when the press becomes a scroll
(`pointercancel`), or 500 ms after the finger lifts, so a press that produces no
click never eats a later one.

`.app-content` is the vertical overscroll surface for every route, continues
behind the floating glass bottom navigation, and must retain enough bottom
padding/scroll padding to expose the final content above that navigation. The
top header remains opaque white, and route content enters over 0.65 s with the
established blur-to-sharp motion. Changing the month with the header arrows
replaces that motion with a two-layer horizontal slide on the shared
`--page-slide-motion` timing, which reuses the navigation-detail push curve and
which both layers must read from so they cannot drift apart: the outgoing month
slides off one edge while the incoming month slides in from the other, matched
1:1 so the two read as one moving surface. Forward months enter from the right
and earlier months from the left. The outgoing layer is a static DOM snapshot
cloned when the arrow is pressed, so it must stay visually frozen — every
animation and transition inside it is suppressed — and it is clipped to the
content area rather than crossing the desktop rail. The snapshot's `scrollTop`
is restored only after the layer joins the document, because a detached element
ignores it. Scroll-driven values are copied onto the clone
(`freezeScrollProgress`), and every `content-visibility: auto` element (the
Budget category sections) gets the live element's current height, less its
padding and borders because the intrinsic size is a content size, as its
`contain-intrinsic-size` (`freezeIntrinsicSizes`): a fresh clone has no
remembered sizes, so without it the snapshot comes out shorter than the page and
its restored scroll position is clamped. A shown floating add button is copied
too (`cloneFloatingAction`), positioned inside a full-size
`.page-slide-out--floating` layer so it travels the page's width with the
outgoing month instead of vanishing when the Budget view remounts. A month
change with no matching snapshot, including the month picker and browser
history, keeps the blur-to-sharp entrance instead of sliding half of it.
Settings and Organize suppress the entrance animation entirely for month
changes, however the month was chosen, and every tab change keeps the
blur-to-sharp motion.

## Scroll to top: header tap and current-tab tap

Tapping the mobile header anywhere that is not one of its controls (the logo or
the gaps around it) scrolls `.app-content` back to the top, and tapping a pushed
detail's header does the same for its body. Tapping the tab that is already
selected, in the bottom navigation or the desktop sidebar, also scrolls
`.app-content` to the top instead of navigating; Settings while Organize is open
still navigates to Settings. Before scrolling, the re-tap calls
`announceTabReselect` (`src/components/ui/tab-reselect.ts`), and a page showing
a secondary view in place of its list listens with `useTabReselect` and returns
to the list, the way re-tapping an iOS tab returns to its root: Transactions
closes Recently deleted and clears its checked rows, exactly as the trash tile
does. Both stand in for iOS's status-bar and Dynamic Island tap, which cannot
work here: iOS keeps those taps for itself and never delivers them to the page,
and it only scrolls a page to the top when no other scroll view is on screen,
while every route here scrolls inside `.app-content`. Do not try to recover the
system gesture by leaving the page scrolled by an offset; the history file
records why it fails. `scrollToTopOnHeaderTap` in
`src/components/ui/scroll-to-top.ts` ignores taps on links, buttons, fields,
labels, and the month picker popover (`role="dialog"`) only when they sit inside
the tapped header, because the pushed detail's whole header is itself inside a
Radix dialog. A click the month picker swallowed while dismissing never reaches
it. The scroll is smooth, and instant under reduced motion, through the shared
`scrollToTop`.

## Pull-to-refresh

### Native bounce

Every tab adds a touch pull-to-refresh at the top of `.app-content`, refetching
the selected month's snapshot and announcing the outcome under that tab's own
name. It does not fake the rubber band, and no script ever positions anything:
`.app-content` keeps `overscroll-behavior-y: auto`, nothing calls
`preventDefault`, and WebKit's own elastic bounce moves the content.
Script-driven transforms read from `scrollTop` trail the compositor-driven
bounce by a frame and visibly twitch, and a CSS scroll timeline cannot help
because it clamps at zero and never sees overscroll. Content above the scroll
origin is not painted in the overscroll gap either, because WebKit's scroll
layer spans only the reachable scroll range, so the 58 px indicator band must
live inside that range. `.app-content` therefore extends `--pull-band-height` up
under the opaque header (negative top margin, matching top padding and
`scroll-padding-top`), and the band is an absolutely positioned first child
filling that padding. At rest the header covers it; the native bounce carries it
out with the content, frame-exact, with no script involved. Anything sticky
inside the scroller must add `--pull-band-height` to its `top` (the desktop
`.right-rail` does), and the month-slide snapshot `.page-slide-out` repeats the
same top padding so the outgoing page does not jump.

### Observation and thresholds

`pull-gesture.ts` only observes: from the first touch or scroll event until the
finger is up and the bounce has returned, it reads `max(0, -scrollTop)` every
frame and writes `--pull-progress`, which drives the dial's opacity, scale, and
arc fill. Browsers that never report a negative `scrollTop` (Android, desktop)
therefore have no pull-to-refresh, by decision. Because WebKit only rubber-bands
a container that actually overflows, coarse-pointer view roots inside
`.app-content` are at least `100% + 1px` tall. The pull never starts while a
sheet, a pushed detail, or a list drag is active. The arc starts filling at 29
px of overscroll (`pullFillStart`, half of `--pull-band-height`, where the dial
clears the header; keep the two in step) and completes at the 145 px refresh
threshold (115 px before 6.11.0, raised so a casual pull does not refresh; the
rubber band resists ever harder, so a long pull tops out near 180 px). Reaching
the threshold refreshes at once, with the finger still down, as UIRefreshControl
does; a pull released short of it just bounces back. A release past it that no
frame observed first still refreshes from the touch-end handler. One pull
refreshes at most once (`triggeredRef`, cleared when a new first finger lands):
a refresh that finishes while the finger still holds the content does not
restart, and the band dial stays hidden until the finger lifts. Triggering at
release instead looked laggy, because iOS paints the hand-off several frames
after the script switches state (about 70 ms in the Simulator and up to 300 ms
measured on device, with the script itself done in about 10 ms), so the dial
rode back with the bouncing content as a still, full ring until the spinner
appeared. Handing off under a held finger keeps the content still through that
gap.

### Refreshing without holding the content

The content is never held open while refreshing, because the web has no
equivalent of UIRefreshControl's `contentInset`: WebKit's bounce always returns
to zero, a negative `scrollTop` cannot be written, and every way tried of
holding the content failed on device. Summing a CSS `translate` with the native
bounce-back stutters however the curve is tuned. Swapping the bounce for a
`translate` by zeroing `scrollTop` still jitters and flashes. Toggling the
scroller's `overflow` makes WebKit rebuild the scroll layer, which flashes.
Per-frame script compensation lags a frame and twitches. So when a refresh
starts nothing touches the scroller, and the content bounces back natively once
the finger lifts. Instead `handOffDial` writes the overscroll at that moment to
`--pull-handoff` and enters the `releasing` state, which hides the in-scroller
band and shows `.pull-refresh-float`, a 44 px white chip carrying the same dial,
exactly where the band's dial was. While the finger still holds the content, the
surface carries `data-pull-held` and the chip stays parked at that hand-off
height (`--pull-handoff-offset`), spinning in the gap the pull opened; a refresh
that finishes during the hold fades it out there. Once the finger lifts, or at
once for a refresh started by the release, the `refreshing` state glides the
chip on `--pull-hold-motion` to `--pull-float-top` below the header, where it
floats over the content and spins. The chip's `z-index` keeps it above
`.app-content` and below the header. At the end of a refresh the chip fades and
shrinks on `--pull-settle-motion`; keep `settleDuration` in `pull-gesture.ts`
equal to its duration, since it clears the state attribute once that transition
ends. The spinner holds for at least 1,080 ms and at most 5 s, and the outcome
is announced in a polite live region rather than a toast.

## Page entrance

Each tab and each launch enters with `page-enter` on the children of
`.app-content--enter`: a 0.65 s fade up from 16 px below, un-blurring from 14 px
and scaling from 0.99. Its `transform-origin` is
`50% min(50%, var(--viewport-height) / 2)`, so the scale centers on the visible
part of the page. With the default centered origin, a page's top edge also
dropped by 0.5% of the page's full height, so a long Transactions list with
production data slid up visibly farther than the short dev seed or a shorter
tab.

## Landscape phones

### Island side

A phone on its side is at least 760 px wide, so it gets the desktop layout
(phones 402 px tall or less on their side see the rotate-to-portrait prompt
instead, below), adjusted by one block at the end of `responsive-motion.css`
(`min-width: 760px`, `max-height: 500px`, landscape, `pointer: coarse`, so
desktop windows and iPads never match). iOS reports the same left and right
inset in landscape whichever side the Dynamic Island is on, so the inline head
script `islandSideScript` (`src/app/safe-area-launch.ts`) marks `html` with
`data-island` (`left` at a screen rotation of 90°, `right` at 270° or -90°,
otherwise `top`) and updates it on every `resize` as well as on orientation
changes, because waiting for the orientation event alone laid the page out for a
left island first and then visibly jerked it over; `tokens.css` turns that into
`--island-inset-left` and `--island-inset-right`: the real inset on the island's
side and 0 on the other, defaulting to the left before the attribute exists.
Landscape rules use these tokens, never `env(safe-area-inset-left/right)`
directly.

### Layout

The sidebar column grows by `--island-inset-left` and pads its left edge by it,
so the navigation clears the island when it is on the left, and the sidebar
shows only the centered logo without the wordmark. The Budget page drops the
right summary rail, centers its column at up to 520 px, and uses the mobile
summary card (arc and Income, Planned, Spent row) instead of the desktop bars.
The portrait text-size block at the top of `responsive-motion.css`
(`max-width: 759px`) also matches this query, so category titles, item names,
amounts, and summary labels keep their phone sizes, and the sidebar navigation
labels grow to 15 px. Better Buddy docks 10 px from the right edge, or
`--island-inset-right` plus 8 px when the island is on that side, and his left
dock clears the widened sidebar. A 180° flip between the two landscape
orientations fires no resize, so the attribute can still change after iOS has
rotated the page; the sidebar column, its padding, the main panel's right
padding, and Better Buddy's `left` and `right` therefore transition on
`--island-shift-motion` (0.4 s on the push curve) and glide to the new side
instead of snapping. When the island is on the right, `.app-main` pads its right
edge by `--island-inset-right` instead, so the main panel, and the Budget column
centered in it, keeps the same width and position relative to the sidebar in
both landscape orientations.

### Short landscape screens

A touch screen on its side cannot be used at all, at the user's direction, when
it is narrower than 760 px and at most 500 px tall, such as the folded iPhone
Duo (678 × 466) or an iPhone SE (667 × 375), too narrow for the layout above and
too short for the portrait one; or when it is at most 402 px tall, the iPhone 18
Pro (and 17 Pro) on its side, which the user found too short for the landscape
layout too. Taller phones, such as the Pro Max at 440 px, keep the landscape
layout. `RotateToPortrait` (`src/components/shell/rotate-to-portrait.tsx`,
mounted in the root layout so it also covers sign-in) covers the whole screen
with a "Turn your phone upright" prompt and a phone glyph that turns upright on
a loop, at `z-index: 100`, above every sheet and menu. The query is two lists
joined by a comma,
`(pointer: coarse) and (min-aspect-ratio: 4/3) and (max-width: 759.98px) and (max-height: 500px)`
and `(pointer: coarse) and (min-aspect-ratio: 4/3) and (max-height: 402px)`; an
aspect ratio rather than `orientation` keeps an Android keyboard, which shrinks
the layout viewport, from triggering it in portrait. The prompt pads both sides
by the larger of the two insets, so it centers on the screen rather than in the
space beside the folded Duo's status strip. `app-shell.css` draws the prompt
from that media query, so it shows from the first paint with nothing underneath
flashing, and the component repeats the query in `matchMedia` to set `inert` on
every other child of `body` while it shows, so focus and screen readers cannot
reach the app behind it either. Keep the two queries identical. iOS ignores
orientation locks for Home Screen web apps, so the app cannot hold itself in
portrait instead.

## Launch images

### iPhone Duo

`src/app/ios-startup-viewports.json` lists both Duo screens, the 466 × 678 pt
cover and the 669 × 951 pt inner screen, each at 3×, so the Duo gets the same
icon-and-wordmark launch image as other iPhones; before 6.14.0 it matched no
startup image and launched black, then white. iOS copies the matching image into
the web clip (`startup.png` and `startup-landscape.png`) when the app is added
to the Home Screen and never fetches it again, so an install made before the
images existed keeps launching without one until it is removed and added again.
It stores one pair only, from the screen the app was added on, and draws it on
the other screen too. Each screen's image is laid out for that screen, so an
install made folded shows the usual 168 pt logo folded and about 240 pt
unfolded. A shared-proportion layout (one logo size scaled across both screens)
was tried and reverted: the user preferred the full-size logo folded.

On the unfolded screen iOS draws the portrait image (`startup.png`) in both
orientations and never the landscape one, so in unfolded landscape, the Duo's
default unfolded pose, it is stretched about 2× wide. This was checked by
unfolding a cloned Simulator in DeviceHub and capturing launches on the inner
display. It is the long-standing iPad bug ([WebKit 241799][webkit-241799], moved
to Apple as rdar://56103114; open since iOS 13 and still present in the iPadOS
26 beta), which the Duo's inner screen shares. Because one stored file serves
every unfolded orientation, landscape cannot get a different or blank image; the
user chose to keep the logo rather than a plain white splash on the Duo.

[webkit-241799]: https://bugs.webkit.org/show_bug.cgi?id=241799
