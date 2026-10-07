# Sheets, menus, and toasts

Read this before changing any sheet, the transaction hold menu, or toasts.
`history/sheets-and-menus.md` holds the recordings and superseded builds behind
these rules; read the matching section there before reverting one.

## Sheets

### Dim and entrance

All sheets share the same interaction contract: a slight iOS-style dim
(`--overlay-dim` in `tokens.css`, `rgb(19 28 45 / 16%)`) that fades in and out
with the sheet and, during a mobile drag, lightens in proportion to how far the
sheet has been pulled down, easing back on settle and out on dismissal with the
sheet's own exit curve (`exitMotion` returns it). Mounting a sheet can cost
several frames, which would consume most of a 0.6 s expo-out fade before its
first paint and make the dim pop in, so the overlay's fade-in stays paused until
`data-entered` is set two animation frames after opening, the same deferral the
navigation-detail entrance uses. The sheet overlay reaches a full
`--viewport-height` past the top and bottom edges of the screen, because iOS
shifts fixed layers down for a frame or two as a sheet field takes focus and a
flat-edged dim left an undimmed band across the status bar. Taps outside the
screen never reach the overlay, so outside-tap dismissal is unchanged.
Line-item, income-source, and organizer details dim the page behind them with
the same overlay at every width: on phones it darkens the parallaxed Budget
layer during the push, holds its fade until
`data-navigation-detail-state='open'`, and follows the left-edge swipe in
`edge-drag.ts`, 0.6 s `cubic-bezier(0.29, 1, 0.29, 1)` entrance, 0.45 s
`cubic-bezier(0.4, 1, 0.4, 1)` exit, and mobile downward drag-to-dismiss with
distance, velocity, and projected-distance thresholds.

### Drag and dismissal

The sheet drag follows the same rules as the navigation-detail edge swipe
(`navigation-detail.md`): each pointer event writes an inline `transform`
directly, with no smoothing driver and no per-frame custom properties. Release
velocity and the speed-matched exit come from the same helpers in
`src/components/ui/gesture-release.ts`, and the exit `transition` is written
inline on the sheet. A drag that starts during the entrance or a settle picks up
from the sheet's rendered offset. A released drag that does not dismiss settles
back over 0.38 s. The close control, Escape, and an outside tap keep the 0.45 s
exit, on `cubic-bezier(0.45, 0, 0.25, 1)` for both the sheet and its dim, the
curve the Better Buddy chat closes on. It starts from rest and speeds up as the
sheet leaves; do not use the entrance family's front-loaded curve for the exit,
which reads as the sheet snapping shut. A drag dismissal is unaffected, because
it writes its own speed-matched transition and ends the keyframe exit in 1 ms.
Desktop modals keep their own fade-and-scale close.

A sheet's content must not change while it closes. Drive `open` from its own
boolean and clear the data the sheet renders in `onExitComplete`, as Move money
and the Budget page's item delete sheet do; never derive `open` from that data
being non-null, or the sheet collapses to its fallback content in the first
frame of its exit.

The flip side: a sheet that holds a draft starts it fresh every time it opens,
so a draft dismissed without saving never reappears. Reset the fields when the
sheet opens, never after a save or on close, or the fields visibly empty while
it slides away. A sheet that owns its state resets during render when `open`
turns true (`TransactionSheet`, Add income source) or when its target changes to
a new one (Record income, which also re-dates to the viewed month); a sheet
whose state lives in its parent resets in the handler that opens it (Add
category, Add line item, Change password, Import backup, which returns to
Merge); a sheet mounted per opening takes a fresh `key` (Move money, the
allocation picker).

### Layout

Keep the grabber, title, and any header action fixed while only `.sheet-body`
scrolls; prevent horizontal sheet overflow. A sheet may pass `headerAccessory`,
a control that sits in that fixed chrome under the title row
(`.sheet-header-accessory`, which also tightens the header's bottom margin from
20 px to 8 px). Add and Edit transaction put their Expense/Income selector
there, centered, so it never scrolls away, as `.segmented--compact`: a capsule
at most 250 px wide and 40 px tall (listed with the other pills in the
`corner-shape: round` opt-out in `tokens.css`), its 34 px segments widened to 44
px tap targets by a `::after` that reaches 5 px above and below them, which is
why the compact control keeps `overflow: visible`. Income turns the selector's
thumb, track, and both submit buttons green (`--green`, `#1eb574`); the buttons
carry the selected kind as `data-kind`. White text on that green is about 2.7:1,
below the 4.5:1 AA bar for 14 px text, a trade-off the user chose for a brighter
green.

Desktop sheets use the same timing as centered modals without drag dismissal.
Below 760 px a sheet sizes to its content up to `min(92dvh, 850px)`; the
`capped-mobile` variant, which the add and edit transaction sheet uses
everywhere except the budget-item detail (there it is `full-screen-mobile`),
instead stops 28 px below the mobile header bar so the header stays visible
above it. Below 760 px these half sheets, the Better Buddy chat included, are
pinned by their top edge, not their bottom: `top` is `--viewport-height` (the
screen's bottom edge) and `translate: 0 -100%` lifts each by its own height, so
at rest they sit exactly where `bottom: 0` put them, and the entrance, drag, and
exit transforms compose with it unchanged. Do not pin them with `bottom: 0`:
taller half sheets then lurch twice as the keyboard opens. Full-screen sheets
are already pinned to the top.

A sheet whose focused field rides on the keyboard passes `followKeyboard`, which
raises the whole inset on the keyboard's `raise` curve instead of staging growth
and body: the Better Buddy chat (`assistant.md`) and Move money, a content-sized
sheet that reaches its `max-height` partway up the number pad. A following sheet
is held at its current height, with an inline `min-height: 0`, just before it is
marked fitted (`holdHeight`), so CSS that resizes a fitted sheet, such as the
chat's full height while fitted, eases with the keyboard rather than snapping;
the hold also lifts `max-height` (`none`) until the fit is cleared. While a
following sheet is fitted its height is set in pixels, so `inSetHeightSheet`
counts it as a set-height sheet and a reveal's scroll-room loan is applied at
once rather than eased in as extra height. Its height transition also counts as
keyboard-fit motion (`isKeyboardFitMotion`), so the reveal scrolls the Amount
field alongside the rise instead of waiting the 440 ms for the height to settle.

A sheet's focused field must sit inside its `.sheet-body`, never in its
`footer`: with a field in the footer focused and the keyboard up, iOS would not
scroll the body at all (`assistant.md`). Every date field sits in a
`.date-input-shell` with the `CalendarDays` icon, as in Add transaction and
Record income: iOS sizes a bare `<input type='date'>` to its own content rather
than the field.

### Keyboard fit

Every sheet makes room for the on-screen keyboard without moving
(`useKeyboardFit` in `src/components/ui/keyboard-fit/`, which every sheet uses).
Their fields use still focus (`budget-and-inputs.md`), which holds the page
still, so iOS no longer carries a sheet up by scrolling the page.

**The inset.** While a field inside the sheet has focus and the keyboard is up,
the sheet's bottom padding (`--sheet-keyboard-inset`, part of `.sheet-content`'s
`padding`) becomes however far the keyboard covers the sheet: from the sheet's
bottom edge to the keyboard's top edge, in layout-viewport pixels. The sheet
stays anchored where it is. A content-sized half sheet grows taller by the
inset, up to its variant's own height cap, since its top edge is what moves
(`translate: 0 -100%` keeps its bottom on the screen's edge), so a short sheet
such as Add line item keeps all its content in view above the keyboard. A sheet
at its cap, and the fixed-height `full-screen-mobile` sheets, keep their height,
and their `.sheet-body` and footer end at the keyboard's top edge instead.
`.sheet-body` is the scroll container a focused field scrolls within to clear
the keyboard and calculator bar. The cover is measured rather than taken as the
keyboard's height, so if iOS has already moved the layout viewport to meet the
keyboard, the inset shrinks to match.

**Following and holding.** The inset follows the keyboard while it comes up,
because iOS can report the keyboard without its suggestions row and add the row
a moment later. It is held for 600 ms (`SWITCH_HOLD_MS`) after focus moves
between the sheet's fields: moving to a field whose keyboard is shorter or
taller, such as the number pad, scrolls the body instead of resizing the sheet.
A change while the keyboard stays up, such as the suggestions row, follows in
100 ms, since iOS shows the row at once. A change that arrives while the sheet
is still rising, within the rise's own settle time, instead retargets the rise
on its `raise` or `grow` motion (`risingUntil` in `keyboard-fit/index.ts`), so a
first check that measured little or no cover cannot make the sheet snap ahead of
the keyboard.

**Motion.** The inset's motion was fitted frame by frame to a 60 fps recording
of the iOS keyboard: it rises over 360 ms on `cubic-bezier(0.2, 1, 0.45, 1)` and
lowers over 230 ms on `cubic-bezier(0.2, 0.05, 0.3, 1)`, and lowering starts 16
ms into its curve, making up the frame it starts after the keyboard. A sheet
that grows to make room (`sheetGrowth` in `keyboard-fit/pending.ts`:
content-sized and below its `max-height`, such as Add line item or Edit
category) moves as a whole; it rises on the same curve from the frame after the
keyboard over 440 ms, slightly behind the keyboard, as asked for on Add line
item. A sheet that reaches its `max-height` partway eases in only the growth it
has room for, over the same 440 ms, then takes the rest of the inset from its
body, behind the keyboard, in 100 ms.

**Closing.** When the keyboard closes, the part of the inset that only shortens
the body is dropped at once (`insetInHeight` in `pending.ts`) and only the part
that lowers the sheet's top eases out, 16 ms into its curve, so a sheet at its
cap starts down with the keyboard. A body scrolled down with the keyboard up is
scrolled further than it can be once the keyboard is gone, so `settleBodyScroll`
in `keyboard-fit/scroll-settle.ts` reads the body's scroll position before any
of the inset drops, sets it to the position it will end at
(`settledClientHeight`), shifts the body's content by the difference with
`transform` so nothing moves, and eases the shift away on the keyboard's closing
curve, so the content glides back with the sheet. None of this applies to a
sheet whose height the inset does not change (`insetInHeight` of zero), such as
the tall Add and Edit transaction sheet: iOS applies the scroll a frame apart
from the shift there, so it eases its whole inset out, its body lengthens with
the keyboard, and a list scrolled to its end follows the keyboard down.

**The shield.** The iOS 26 keyboard is translucent, and the inset trails its
edge by up to 95 pt in the first frames, so every sheet has a white shield
(`.sheet-keyboard-shield`, moved by `keyboard-fit/shield.ts`) at the bottom of
the screen in front of its body and footer, whose height follows the keyboard's
cover on its own transition. Rising, it starts 24 ms into the keyboard's curve,
which keeps its top at most about 22 pt ahead of the keyboard's edge and never
behind it; lowering, it starts 8 ms into the keyboard's curve, never ahead of
the keyboard and at most about 15 pt behind it, because the body behind it is
already back at full length. The shield is a fixed layer beside the sheet in the
same Radix portal, not a child of it: `.sheet-content` clips its children to its
own height, so a shield inside a growing sheet could not reach above the sheet's
top. The content's `data-keyboard-shield-id` names its shield (`useId` in
`sheet.tsx`). The shield is pinned by its top edge like the half sheets
(`top: var(--viewport-height)`, `translate: 0 -100%`) and shares the sheet's
`z-index` and `data-layer`, painting above its sheet by coming after it, and
below the calculator bar. Because it does not move with the sheet's transform,
it stays under the keyboard while a sheet is dragged, and `useKeyboardFit`
lowers it with the keyboard even while the sheet is dragging, springing back, or
swiped away, when it leaves the inset alone; it unmounts with the sheet.

**Re-checks.** The fit re-checks on every `visualViewport` resize and scroll and
on `focusout` (iOS moves the layout viewport down to meet the keyboard as a
visual-viewport scroll), so it eases back to zero when the keyboard closes or
focus leaves the sheet. It leaves a sheet alone mid-drag, while it springs back,
and once it is swiped away, re-checking when the finger lifts and again 450 ms
later (`RELEASE_SETTLE_MS`, past the 400 ms spring) for anything it skipped,
since changing the inset mid-spring would replace the spring's transition.

**Dragging with the keyboard up.** iOS draws the caret itself and does not move
it with the sheet's transform, so a field focused while the sheet was dragged
would leave its caret floating where the field had been. Once a drag has moved a
sheet more than 4 px, `sheet.tsx` therefore marks it `data-caret-hidden`, which
makes a focused field's caret transparent, and widens and restores the field's
selection, because iOS repaints a caret only when the selection changes (as
`revealTitleCaret` does in `navigation-detail.md`). An empty field has nothing
to select, so `hideCaretIn` sets its value to a space for the widened selection
and puts the empty value back before restoring the selection; setting the value
from script fires no `input` event, so React state is untouched. Only the phone
shows this: the iOS Simulator hides the caret either way. The keyboard stays up
during the drag; do not blur on drag start, which drops the keyboard under the
finger. Released to dismiss, the field is blurred at once, so the keyboard
closes as the sheet goes down and the sheet leaves with its inset; released to
spring back, the field keeps focus and its caret returns, through the same
selection nudge, once the spring has finished. A press that never moved the
sheet, such as a tap on its header, releases in place without the spring, so the
fit is not held off for 450 ms. Do not lift the sheet onto the keyboard with
`translate` instead of growing it: a sheet that moves reads worse than one that
stays put and grows.

### Focus

Sheets have no visible close control: a sheet is dismissed by dragging it down,
tapping outside it, or Escape. `sheet.tsx` still renders a `Dialog.Close`
labelled Close with Tailwind's `sr-only` and `tabIndex={-1}`, so VoiceOver,
which can neither drag nor tap outside, can find and activate it, while Tab
never lands on an invisible button. `.sheet-header` keeps a 44 px `min-height`,
the height the close button used to give it, so titles did not move when it
went. Sheets focus their content container on open. When a pointer-opened sheet
closes, restore focus without a visible ring; keyboard-opened sheets must
preserve visible keyboard focus on restoration. Focus returns to
`restoreFocusRef` when the caller passes one, and otherwise to whatever had
focus as the sheet opened (`focusOpener` in `sheet.tsx`), unless that was a text
field, which could raise the on-screen keyboard again, or has since left the
page. The sheets open from controlled state rather than Radix's
`Dialog.Trigger`, so without `focusOpener` Radix returns focus to nothing.

## Hold menu

### Opening

Transaction rows open an iOS-style hold menu from
`src/components/ui/hold-menu/`. A touch or pen press held 450 ms without moving
more than 8 px opens it; the row eases to 0.97 scale with the long-press tint
after a 120 ms delay so taps and scrolls never visibly shrink it. A mouse never
starts the timer: right-click, a two-finger trackpad tap, Android's own long
press, and the keyboard context-menu key or Shift+F10 all arrive as
`contextmenu` and open the same menu, which a second `contextmenu` while open
ignores. The menu is a modal Radix Dialog so it layers correctly over the
line-item detail (itself a Radix Dialog): its Escape, focus trap, and
pointer-outside handling stack with the detail's instead of closing it.

### Layers and the lifted row

The overlay is a light translucent fill with a `backdrop-filter` blur (opaque
fallback where unsupported), fading in over 0.3 s. The layer above it holds a
static clone of the row, rendered as a white card with rounded corners and a
shadow, and the action panel, which springs in from the corner nearest the row
and aligns with the card's left edge. The card is the row's measured box widened
by `previewInset` (12 px, applied inline as padding so the row's content stays
in place). A held clone also starts with the pressed row's `#f5f8fd` tint and
fades it to white over 0.45 s, so the swap from the tinted row does not flash.
Its lift animates from exactly the row's box (`--hold-menu-row-left` and
`--hold-menu-row-width`, no padding, square corners, no shadow, the pressed 0.97
scale) to the padded card on a slight spring, and its exit animates back to
exactly that box. The clone must always start and end at the row's exact box;
animation values override the inline padded geometry. The box is measured
without the row's own transform (`untransformedRect` in `index.tsx`), because a
held row is still easing back from its 0.97 pressed scale when the menu opens.
The original row is transparent (`opacity: 0`, not `visibility: hidden`, so
focus can still return to it; set from the clone's ref callback in the same
commit that paints the clone, so no frame shows neither) while the menu is open
and until the layer's exit animation ends, so the clone stands in for it and
swaps back pixel for pixel.

### Placement

Placement (`layout.ts`) puts the panel below the row, above it when below does
not fit, and otherwise slides the clone up so both fit, all within the layer's
padding, which is the safe-area insets or 12 px. The panel carries no
`backdrop-filter`, because its continuous-corner clip-path would make it a
backdrop root and blank the blur; it is a near-opaque surface over the
already-blurred page instead.

### Held-finger selection

While the finger that opened the menu stays down, sliding it highlights the item
under it and lifting it on an item selects that item, as on iOS; lifting
elsewhere leaves the menu open. Highlighting and release selection arm only once
the finger has moved more than 10 px (`selectionSlop` in `press.ts`) from where
it was when the menu opened, because the menu can open under a finger that never
moved, and lifting it would then silently run Delete. During that phase a
non-passive `touchmove` listener prevents scrolling, and a click the browser
synthesizes on release is swallowed in the capture phase for 350 ms unless it
lands on a menu item, or it would land on the overlay and close the menu. Clicks
on items are never swallowed, and `select` ignores a second selection once the
menu is closing, so an item can never act twice.

### Closing and keyboard

Closing restores focus to the row (without a visible ring unless the menu was
opened from the keyboard) and only then runs the chosen action, so a sheet
opened by Edit records the row as its focus-return target. Arrow keys, Home, and
End move between items, Tab closes the menu, and a keyboard-opened menu focuses
its first item. Delete is red and set apart by an inset separator. The panel
clips its contents to its rounded corners, and the pressed, highlighted, or
focused item shows a pill (`border-radius: 999px`, inset 6 px from the panel's
sides, listed with the other pills in the `corner-shape: round` opt-out in
`tokens.css`).

### Exit and stacking

The exit is 0.22–0.28 s: the panel shrinks and fades, the clone slides back to
the row's position while its shadow and corner rounding settle to none without
fading, the overlay fades out over 0.22 s on a fast-clearing curve, and the
layer's own no-op `hold-menu-layer-out` animation marks the end, at which point
the row is revealed. The clone's settle and that marker share
`--hold-menu-settle-duration`, which `placeMenu` sets to 0.26 s, or 0.42 s when
the clone was slid up to make room and has to travel back, on the ease-in-out
`cubic-bezier(0.45, 0, 0.2, 1)`. When the menu closes because an item was
chosen, the overlay and layer drop from `z-index` 75/76 to 71
(`data-exit='action'`) for the exit, because the chosen action (Edit) opens a
sheet at once and the settling clone and fading blur otherwise drew over it. At
71 they tie with sheet and navigation-detail content, so DOM order decides: a
sheet opened by the action mounts its portal later and draws above the exiting
menu, while a navigation detail the menu was opened from mounted earlier and
stays below it. Dismissing without an action keeps 75/76. When a menu opened
from a page (not inside a dialog such as the line-item detail) closes without an
action, the layer drops from 76 to 29, below the bottom navigation (30) and
Better Buddy (40), as soon as the 0.22 s overlay fade has finished, so the
returning clone slides under those floating controls for the rest of its trip;
the step sits at 85% of the 0.26 s settle (`hold-menu-layer-drop`) or 53% of the
0.42 s travelling settle (`hold-menu-layer-drop-travel`), so keep those
percentages in step with the durations. It cannot drop earlier: while the blur
is still fading, anything above the clone would render sharp over a blurred
page. The line-item detail's floating add button cannot sit above the clone at
all, because it is positioned inside the detail's own `z-index: 71` stacking
context, which the clone must be above to show over the detail. The overlay must
finish before that swap, or the row is revealed under a faint residual blur.

## Toasts

One toast shows at a time, above the bottom navigation on mobile and in the
bottom-right corner on desktop. It sets `pointer-events: auto` because an open
Radix modal sets `pointer-events: none` on `body` and the toast lives outside
every dialog, so without it Undo or Retry would be untappable while a sheet is
open. Toasts dismiss themselves after 5 s unless they are `persistent`; a
persistent toast (a failed save's Retry) stays until the person acts on it and
always carries a dismiss button beside its action.
