# Budget page and inputs

Read this before changing Budget rows, the summary arc, the Transactions
filters, or money inputs. `history/budget-and-inputs.md` holds the recordings,
Simulator probes, and superseded builds behind these rules; read the matching
section there before reverting one.

## Budget rows

### Row actions

Category headers expose an edit menu; budget-item rows alone use a deliberately
leftward swipe to reveal two 68 px actions in the iOS order: a blue **Move**
beside the row and, at the far right edge, the destructive red **Delete**, as
UIKit places a list's destructive action outermost. `SwipeReveal` takes an
`actions` list and opens by 68 px per action, published to CSS as
`--swipe-reveal-width` so keyboard focus reveals the same width. The actions fan
out like an accordion as the row moves: each starts stacked under the row's
trailing edge and takes an equal share of the revealed width, so with `n`
actions the one at index `s` sits `revealed × (n − s) / n` in from the right,
later actions painting over earlier ones, as UIKit layers them, so Delete slides
in from the screen edge on top while Move trails the row. Every button stays 68
px wide, so a fully open row puts each exactly in its 68 px slot. `SwipeReveal`
writes the drag offset (`--swipe-reveal-x`) and its
`data-dragging`/`data-settling` flags on the `.swipe-reveal` root rather than
the row, so the row and the actions (siblings) track and settle from the same
values on the same curve; each action's share is an inline
`--swipe-reveal-share`. The write stays on one row, never `body`. Keep the
inactive swipe actions fully transparent so fast vertical scrolling cannot flash
their colored layers.

**Move** opens the Move money sheet (`move-money-sheet.tsx`), a content-sized
sheet with **Move** as its header action (`sheet-header-submit`), like Add
transaction's **Add**. It must not be a footer button, which rides the keyboard
inset and shows every misstep in it. A compact segmented control in its fixed
header (`headerAccessory`), as in Add transaction, picks **Planned** (lower one
item's planned amount and raise the other's, capped at the source's plan, so
Left to budget does not change) or **Remaining** (internally a transfer: an
expense `Transfer to …` on the source and an income transaction
`Transfer from …` on the destination, dated `defaultDateForMonth`, with no date
field). The swiped item is fixed on one side, a category-grouped select of item
names picks the other, and the swap button between them flips direction, so an
overspent item can pull money in. The swap arrow sits the same distance below
the From box as above the To box (about 33 px each): the button's 17 px top
margin matches the To label and its gap under the button's -8 px bottom margin,
so change them together. The amount field has no standing hint, because the
preview below carries the numbers. In Planned mode an amount above the source's
plan disables **Move** and turns the preview into its limit state instead of
adding a message under the field: the card takes a soft red tint, the source row
reads `only $… planned` in red, and the destination row dims to its unchanged
remaining amount. The preview is `aria-live` and the amount field points at it
through `aria-describedby`, so the limit is announced without a separate alert.
The preview card, labelled Remaining, is always shown with a From row and a To
row, so it never changes height: an unchosen side reads a muted `Choose an item`
and `—`, a chosen item shows its current `$… left`, and once both items are
chosen and the amount is above $0 each row shows its remaining amount before and
after the move (`availableAfterMove` in `src/domain/budget-calculations.ts`;
both modes shift remaining money identically), with a negative result in red.
Form selects (`.field select`) draw their own chevron 16 px in from the right
edge instead of the native arrow, which sat against the border. The sheet pins
every item's version when it opens and closes only when `mutate` accepts the
write; offline, it stays open with its draft.

### Amount display

The Budget page defaults its amount display to Available unless the per-device
Settings preference selects Planned. Switching Planned/Available on the Budget
page remains temporary and must not resize rows. From 1100 px wide the rows show
Planned, Spent, and Available together and the switch is hidden, so the
preference only governs narrower layouts; every row always renders all three
cells and the `data-amount-view` attribute plus a `max-width: 1099.98px` rule
hide the unselected ones, which keeps the switch free of remounts. The desktop
Planned cell is the same inline plan input, given a soft hover fill and a blue
focus ring so it reads as editable.

### Progress bars

A line-item progress bar represents the share of its starting available balance
still remaining: it is full before any net spending and shrinks toward empty as
spending consumes the balance, including carried-in funds and refunds. A
negative balance replaces the regular fill with a coral striped warning bar and
an accessible over-budget amount.

### Reordering

Reordering starts after a 350 ms long-press on the category header or item row;
movement beyond 8 px before activation must cancel so vertical scrolling and
item swipe-delete remain reliable. Once a reorder activates, `SwipeReveal` drops
the row's pending swipe (and closes one already moving) when the pointer lands
on a `data-long-press-active` handle, so dragging sideways with the lifted copy
never slides the faded placeholder open. The lifted copy is a clone appended to
`body` (`createPreviewOverlay` in `src/components/ui/sortable-list/preview.ts`),
so it loses any rule that depends on the row's place in the list, such as the
first Budget item's 3 px top padding on phones; the clone therefore takes its
handle's computed top and bottom padding inline, and it would otherwise lay out
8 px lower in a box of the original height and clip the progress bar. Budget
rows have no side padding, so their lifted card
(`:has(> .swipe-reveal-content)`) grows 12 px outward on each side as
content-box padding, keeping the name, amount, and bar exactly where they were
instead of against the card's edge. That first-item padding also changes on drop
whenever the drop changes which item is first, so the commit reflow and the drop
both track text, not boxes: `animateOrder` measures each item's top plus its
handle's top padding (`handlePaddingTop`) before and after the commit, so a row
that gains or loses the 8 px glides it in with the reflow instead of jumping,
and `finish` aims the lifted copy at the landing row's text rather than its
edge. The drop also fades the copy's shadow out, so removing it at the end shows
no seam. The fade is its own animation: box-shadow cannot run on the compositor,
and inside the transform-and-opacity animation it could pull the drop onto the
main thread, where the reorder's re-render stalls it for tens of milliseconds
(measured under a development build). Row separators must not depend on a row's
position either: every Organize item carries the same `border-top` (the first
one draws the line under its category header, and `.organizer-empty-category`
draws it when there are no items), so every row is the same height and each
shifted row brings its own line into its new slot. A first-item exception such
as `item + item` makes the row moving into the top slot carry a second line up
under the header, and makes every row below jump 1 px when the drop commits the
new first item. A visually hidden keyboard control must continue to support
Arrow Up/Arrow Down reordering. Use a transition-free rendered drag copy inside
a neutral compositor shell plus animated list reflow. Never move the source
clone directly with inherited row/header transitions because that creates
compositor ghosting. During a pointer drag, keep the real DOM order fixed,
translate the faded placeholder into the current target slot, and move
neighboring rows with interruptible transforms; commit the React/server order
once on drop. The switch point is measured between titles, whatever the rows'
heights: each row's title is its preview element (the category header, or the
whole row for items), and `updateTarget` in `drag.ts` moves the target down once
the lifted copy's bottom edge passes the next title's center and up once its top
edge passes the previous title's center, both measured where those titles
currently sit after shifting, with 8 px of slack each way against flicker. Rows
of equal height therefore swap at half a row, as before. An expanded category
must not be treated differently from a collapsed one. Edge auto-scroll is
frame-based with gradual acceleration/deceleration and continues while the
pointer is held near an edge. The edge zone is the 100 px inside the scroller's
top and the bottom navigation's top; speed grows with the square of how deep the
pointer is in it, up to `maximumAutoScrollVelocity` (0.6 px/ms; 0.22 felt
sluggish over long budgets), and eases toward that target over about 150 ms.
Item reordering remains within its current category. Summary and budget progress
entrance animations are one-shot and must not replay when a drag preview is
created or a list order is committed.

## Summary arc

The Budget summary arc draws in with `stroke-dashoffset`, but under
`preserveAspectRatio='none'` and `vector-effect: non-scaling-stroke` its dash
lengths are in screen pixels, so `BudgetSummaryCard` measures the rendered
length after mount, writes `--summary-arc-progress-length`, and marks the path
`data-measured`. The progress path stays hidden and its draw-in
(`summary-arc-in`, under `.budget-bars-enter`) does not start until that
attribute is present. Server-rendered HTML paints before hydration, and without
the gate the draw-in started with a zero length, showing a dot at the arc's
start and then jumping partway along once the length arrived; the gap before
hydration is longest under `next dev`, where it was obvious, but it exists in
production too.

## Transactions filters

The Transactions page keeps its All, Expenses, and Income type pills visible and
applies those inline choices immediately. Its sliders control opens a full
filter sheet with transaction type, budget item, and split-status controls.
Sheet changes are drafts until Apply filters is pressed; closing the sheet
discards them, and the sheet's Clear filters action resets only the drafts.
Applied filters give the sliders control a distinct blue treatment and
active-count badge. While filters are applied, expose an outside Clear action
immediately after the Income pill in the same left-aligned group, never pushed
to the far edge of the row. That action resets the applied type, item, and split
filters without clearing search. A populated search field exposes an accessible
clear control that empties the query without returning focus to the input.

## Money inputs

### Calculator entry

Every `CurrencyInput` (`src/components/ui/currency-input/`) doubles as a
calculator. Typing an operator, or tapping one on the operator bar, turns the
field into an expression that starts from the current amount (`$120.00 + 5`);
from then on operands are typed as dollars, not ATM-style cents, because `+ 5`
should mean five dollars. `evaluateMoneyExpression` in
`src/domain/money-expression.ts` evaluates it with exact bigint rational
arithmetic, × and ÷ before + and −, a trailing operator ignored, and one half-up
rounding to cents; results that divide by zero, go negative, or exceed
`MAX_ENTRY_CENTS` are refused. Every valid intermediate result is reported
through `onValueChange`, so callers that read state without a blur (the
transaction sheet's Add button and single-split sync) see the result, and
blur-committing callers commit it unchanged. `=` collapses to the result and
keeps focus, blur collapses too, an invalid expression falls back to the last
valid value, and deleting the last operator returns to ATM entry.

### Still focus

iOS reveals a newly focused field by scrolling the whole page, which slides the
fixed header, the bottom navigation, Better Buddy, and any open sheet with it.
`src/components/ui/still-focus/` replaces that reveal: the field takes focus
without the page scroll, and its own scroll container moves instead, just far
enough for the field to clear the keyboard. The native keyboard and caret are
untouched; only the reveal is ours.

A field opts in through one hook, `useStillField` (`use-still-field.ts`), which
wraps the field's own `onFocus`, `onTouchStart`, and `onTouchEnd` and returns
the combined handlers; `CurrencyInput` takes a `stillFocus` prop that does the
same with `calculator: true`, so the reveal also clears the 56 px operator bar
and keeps the next field's center out from under it. Every piece is a no-op
until an on-screen keyboard at least 100 px tall is up, so desktop focus is
unchanged. The scroll container is the field's nearest ancestor marked
`data-still-scroller`, set once on the container rather than passed by each
field: `.app-content`, `.navigation-detail-body`, and `.sheet-body` carry it. A
field with none, such as a detail title in the fixed header, is focused still
but scrolls nothing.

`autoFocus: true` replaces React's `autoFocus`, whose plain `focus()` lets iOS
scroll: the hook's returned `ref` calls `focusStill` as the field mounts, still
inside the tap that mounted it, so the keyboard opens. `conceal: false` never
hides the field behind a stand-in, so no parking and no veil. The detail titles
use it because the title motion moves their box with a `transform`, which makes
the title the containing block for an absolutely positioned stand-in while
`offsetLeft`/`offsetTop` stay relative to a farther ancestor, so a stand-in
there would land out of place. A title sits at the top of the screen, above
where the keyboard opens, so it has nothing to park away from.

Each file beats one of iOS's reveals:

- `tap.ts` beats the reveal on a tap: a tap that moved no more than 10 px is
  turned into `focusStill` with the touch's default prevented.
- `park.ts` beats the second reveal iOS makes as the keyboard finishes opening,
  which ignores `preventScroll`: the field is parked 10000 px up behind a
  stand-in until the keyboard holds its size for 150 ms (1.2 s limit).
- `veil.ts` beats the reveal for focus iOS moves itself (the keyboard's previous
  and next arrows): the field turns transparent behind a stand-in for 300 ms,
  since iOS skips revealing a transparent field.
- `pin.ts` beats the caret-following page scroll after each edit, undone from
  the window's `scroll` event before it paints.
- `hold-viewport.ts` beats a one-finger drag that no scroll container takes,
  blocked from panning the screen while a field has focus. With the keyboard up
  the visual viewport is shorter than the page, and iOS pans it under a drag on
  a sheet whose content fits, or on its overlay, and under a drag that starts
  inside a scroll container already at its end in the drag's direction (the
  Better Buddy thread resting on its latest message). A vertical drag is
  therefore stopped when its scroll container has no room left in the drag's
  direction, measured from where the touch started, as body-scroll-lock does; a
  drag a scroll container can take, in either axis, is left alone.
- `keyboard-swap.ts` beats the border fade across a keyboard swap. Moving focus
  with the keyboard up between fields on different keyboards (compared by
  `inputMode`, such as Name to Planned this month in Add line item) makes iOS
  hold the page's drawing while it swaps the keyboard, long enough for the 0.2 s
  fade to run out unseen. Both fields keep their pre-move look inline, each
  taken from the other since they have just traded looks, until the frame after
  the keyboard's resize (or 400 ms), then fade. A veiled field is left to its
  stand-in.
- `reveal.ts`, `scroll-room.ts` are our replacement reveal: a smooth scroll of
  the container, down past the keyboard or, for a field partly hidden at the top
  (under a sheet's title, or the part of a scroller its `scroll-padding-top`
  marks as covered, such as the page's pull band or a pushed detail's header),
  up until it clears that edge by the same 16 px, padding the container's end
  when a bottom row could not otherwise clear the keyboard, and gliding that
  padding back once the keyboard closes. On the frame after the keyboard's
  resize, the loan eases out as a transition of the container's bottom padding
  on the keyboard's closing curve (`easeRoomBack`), so a list scrolled into it
  is held at its end as the end eases in, follows the keyboard down, and lands
  on its real end in one motion; in a container that sizes to its content, such
  as the body of a sheet below its `max-height`, the loan is height rather than
  scroll room, and the container eases shorter instead (the loan also eases in
  there, on the rising curve). Do not glide the list to an estimated end and
  then drop the padding, or drop the loan at once: both jump. A loan made while
  a sheet's inset is still easing in is sized for the body's taller,
  pre-keyboard height, since a smooth scroll is clamped to the room there is
  when it starts, so once the inset settles the surplus beyond the furthest
  scroll target is dropped (`trimOnceSettled`), or a flick would scroll into an
  empty stretch below the last field. The loan is added to the container's
  stylesheet padding, read at the first loan, because `.navigation-detail-body`
  has its own bottom padding (20 px, or 94 px beside a floating action, plus the
  safe area) that an inline value would otherwise replace.

`stand-in.ts` holds the one stand-in shared by parking and veiling, and
`reveal.ts` measures the stand-in rather than the hidden field while one is up.
The stand-in is the first child of the field's parent, because a positioned
stand-in placed after the field draws over positioned siblings that sit over the
field, such as the Transactions search's magnifying glass. As soon as the field
has focus the stand-in takes its focused border, background, shadow, and outline
(`wearFocusedLook`), read with the field's transitions off so the target is the
finished style. It gets there through its own stylesheet transitions, so it
fades to blue over the same 0.2 s as an unparked field
(`shell-and-platform.md`); its current look is resolved first so that a stand-in
inserted in the same task has something to fade from. It is placed from the
field's unrounded bounding box relative to its offset parent (`exactBox`), not
from `offsetLeft`/`offsetTop`, which round to whole pixels and visibly nudge a
field that sits at a fractional position. Its height is left to its stylesheet
unless that differs from the field's by more than half a pixel, because WebKit
appears to center a fixed-height single-line field's text lower than a
`height: auto` one's. This assumes no ancestor is scaled at the moment of focus,
which holds because no page, detail, or sheet scales while its fields can be
tapped. Fields and stand-ins are typed `HTMLInputElement | HTMLTextAreaElement`
(`StillField`).

Every text field, textarea, and money field in the app uses it. Plain fields are
`StillInput` and `StillTextarea` (`fields.tsx`), thin wrappers over the hook
(`StillTextarea` also takes `reveal={false}`, which skips the reveal for a field
that stays in view by itself, such as the Better Buddy composer stuck to the
bottom of its body), and `CurrencyInput` turns it on by default
(`stillFocus={false}` opts out; nothing does). Date inputs, selects, checkboxes,
and file inputs stay native: they open pickers rather than a keyboard, so
parking one would hide it for the full 1.2 s limit waiting for a keyboard that
never comes. The sign-in form is left native too. Sheet bodies are
`data-still-scroller` containers, and sheets pad their bottom by the keyboard's
cover so their bodies end above it (`sheets-and-menus.md`, Keyboard fit).

`reveal.ts` waits for any CSS transition running on the scroll container or an
ancestor before it measures, such as a pushed detail sliding in, because a field
measured mid-transition would be scrolled for where it was rather than where it
ends. Only one wait is pending at a time. A sheet's keyboard inset is the
exception (`isKeyboardFitMotion`), since waiting for it holds the reveal back
until the keyboard has finished opening: the reveal asks `pendingSheetRise` in
`keyboard-fit/pending.ts` how much further the sheet's top will still rise, the
sheet's header, footer, full body content, and target inset up to its
`max-height`, and clears the keyboard from where the field will end up, so it
scrolls alongside the keyboard as the Budget page does. The line a field clears
is the keyboard's (or the calculator bar's) top or the end of the scroll
container, whichever comes first once the sheet has fitted
(`settledClientHeight`), because a sheet's footer, such as the allocation
picker's **Done**, stays above the keyboard and ends the body there. A body
whose content exactly fills a `full-screen-mobile` sheet (`inSetHeightSheet`) is
not treated as sizing to its content, so its loan is plain scroll room applied
at once: easing it in left the smooth scroll clamped to no room when it started.
The reveal also measures on the animation frame after each viewport resize
rather than in the event: iOS reports the keyboard's full size the moment a
field takes focus, and a sheet makes room only in that next frame (the keyboard
fit's listener is registered first, so its frame callback runs first); measuring
in the event pads the body at once and jumps a growing sheet. While a stand-in
is up, a statically positioned parent of the field is made `position: relative`,
so the stand-in is positioned against the field's own parent and scrolls with
it. `.sheet-body` is not positioned (the organizer's delete confirmation is
anchored to the whole sheet through it), so a stand-in there would otherwise be
anchored to the sheet and stay put while the body scrolled.

### Caret in sheets

Still focus's parking avoids the page scroll that used to leave a sheet field's
caret behind as iOS moved the layout viewport to meet the keyboard, and its
release sets the selection to the end so iOS redraws the caret. If a sheet
field's caret is ever left behind again, restore a re-selection in
`still-focus/`, not per input; `history/budget-and-inputs.md` records the probe
and the per-input fix that 5.13.0 removed.

### Operator bar

iOS offers web inputs no calculator keyboard, so `CalculatorBar` in
`operator-bar.tsx` portals a toolbar (result preview, ÷ × − + . =, all 44 px
keys) onto the top of the native number pad: it shows only for a coarse pointer
while `visualViewport` is at least 100 px shorter than the full height and
unzoomed. The full height is the running maximum of the viewport height and
`document.documentElement.clientHeight` at the current width
(`fullViewportHeight`), never `window.innerHeight`, because iOS shrinks it along
with the keyboard. The bar sits at `offsetTop + height`. It follows the
viewport's `resize` and `scroll` events, but reads the viewport in the animation
frame after them, not in the event itself: `pinPageWhileFocused` undoes page
scrolls from the window's `scroll` handler, and reading in the viewport's own
handler could catch the page before that undo. Animation-frame callbacks run
after every scroll handler in the same rendering update, so this adds no frame
of lag. The input must never blur mid-expression, since blur commits a
half-typed plan: keys prevent `pointerdown` and act on `touchend` with its
default prevented, which stops iOS synthesizing the focus-moving click, while
`onClick` covers VoiceOver and mouse activation; keys carry `tabIndex={-1}`. The
bar lives outside any Radix dialog, so `sheet.tsx` and
`navigation-detail/index.tsx` exempt `isCalculatorBarTarget` from
outside-pointer dismissal, and it sets `pointer-events: auto` for the same
reason as the toast (`sheets-and-menus.md`). Desktop has no bar; hardware keys
`+ - * / x =` drive the same expression.

There is one bar for the whole app, mounted once in `providers.tsx`, never one
per input. The focused `CurrencyInput` publishes its display state and handlers
to `calculator-store.ts` on every render (`publishCalculator`), and the bar
reads them with `useSyncExternalStore`. Blur releases the bar only after the
current task (`releaseCalculator`), and the next input's focus arrives in that
same task, so moving between money inputs swaps the bar's contents without
unmounting it. A bar per input remounts on every switch and replays its
entrance, a flash between planned amounts.

Once the keyboard is up, the bar slides in from the right (`calculator-bar-in`,
0.42 s on `cubic-bezier(0.25, 0.8, 0.3, 1)` after a 0.25 s delay, waiting just
off the right edge meanwhile). The first `visualViewport` resize already reports
the keyboard's final size while iOS is still raising it, so without the delay
the bar would slide in above a keyboard that had not arrived yet; the delay is
tuned by eye. When the input lets go or the keyboard closes, it slides down with
the keyboard (`calculator-bar-out`, 0.22 s on
`cubic-bezier(0.15, 0.15, 0.3, 0.9)`), travelling exactly the keyboard's height
(`--calculator-keyboard-height`, the full height less the visual viewport's), so
it stays attached to the top of the keyboard's arrows-and-Done row, and fading
out over the last 40 %, since at the end it would sit just above the screen's
bottom edge. That duration and curve are fitted to a 60 fps recording of the
number pad closing; anything below the keyboard's top edge is hidden, since iOS
draws the keyboard over the page, so a curve that runs ahead of the keyboard
reads as the bar vanishing instantly. If a future iOS changes the keyboard's
close motion, re-measure it. Both move through the individual `translate`
property, so its `translateY(-100%)` docking is untouched. Closing keeps the
last contents under `data-state='closing'` and unmounts on that animation's
`animationend`; the global reduced-motion rule shortens it to 0.01 ms, so it
still ends.

While the keyboard is up iOS scrolls the page so the visual viewport sits at the
bottom of the layout viewport, and it drops that scroll in a single step as the
keyboard closes. The bar is positioned in layout-viewport pixels, so a closing
bar holds the keyboard's last on-screen top edge (the visual viewport's height)
and adds the live `offsetTop`, which `useViewportFrame` keeps tracking until the
bar unmounts, so it stays put on screen through the reset and slides down from
there. The bar sits in `.calculator-dock`, a fixed full-screen layer with
`overflow: hidden` and no pointer events, so while it waits off the right edge
to slide in, or slides below the bottom edge on the way out, nothing overflows
the page; a fixed element hanging past the viewport's edge can make iOS readjust
the page. Once docked, the bar ignores keyboard moves under 8 px
(`KEYBOARD_JITTER_PX` in `operator-bar.tsx`), because iOS nudges the keyboard or
page by a few pixels as focus moves between inputs; the value was chosen without
a device measurement, so adjust it if a switch still shifts the bar or a real
keyboard change is missed.

### Fill with what is left to budget

While a planned amount is focused, on a Budget row or in the line-item detail,
the operator bar's preview slot offers a fill chip (`fill` on `CurrencyInput`,
rendered by `CalculatorBar`, built by `leftToBudgetFill` in
`src/components/budget/left-to-budget-fill.ts`) captioned Left to budget with
the amount still unbudgeted, such as `+$425`. When the month is over budget
after the draft, the chip is captioned Over budget and shows the overage as
`−$75`, and the fill carries `tone: 'over'`, which `CalculatorBar` renders as
`data-tone='over'` and `currency-calculator.css` draws in the same red as the
split summary's negative Remaining (`#e3474d` on `#fdecec`). That amount
accounts for the draft: `leftToBudgetWithPlanDraft` in
`src/domain/budget-calculations.ts` is the month's left-to-budget less how far
the draft has moved from the item's saved plan, so typing part of an amount
first shrinks the chip. Tapping it sets the field to `planFillingLeftToBudget`
(the saved plan plus the month's left-to-budget), which leaves Left to budget at
exactly $0 whatever the field held, and ends any expression. It presses like the
operator keys, without taking focus, so the plan still commits on blur through
the ordinary `updatePlan` mutation. `fillValue` in `currency-input/index.tsx`
sets the value by script through `onValueChange`, as the operator keys do.

**A focused field must never change width.** WebKit forces a reveal of the
selection whenever a focused single-line text field's inner text box changes
size, and that reveal runs in a later task, so `pinPageWhileFocused` can undo it
only after it has been painted: the page jumps for a frame. So on phones (the
phone media block in `responsive-motion.css`), the planned `<input>` keeps one
width, 180 px, positioned at the right of `.amount-column--planned`, which clips
it (`overflow: clip`, which also clips its hit area so the item name still takes
its own taps). The column's width comes from `.currency-input-fit`, an invisible
copy of the displayed text that `CurrencyInput` renders when given `fitText`,
with the field's font, tabular digits, and padding, between the 92 px minimum
and the input's 180 px. The input must stay at most twice the column's minimum
width, so its center always falls inside the column: the keyboard's previous and
next arrows skip any field whose bounding-box center hit-tests to another
element (`isObscuredElement` in WebKit's `WebPageIOS.mm`). iOS decides whether
the arrows are enabled when the field takes focus, so a next field that sits
below the layout viewport or behind the bottom navigation at that moment is
skipped. Expressions wider than the 180 px input shrink their font to fit, as
`fitExpression` already does for the field's own width. A typed digit still
moves the page through the edit's own caret reveal
(`revealSelectionAfterEditingOperation`), and `pinPageWhileFocused` puts it back
from the next `scroll` event before it paints. Above the phone breakpoint
`.currency-input-fit` is `display: none` and the field still sizes with `size`,
so a tablet with an on-screen keyboard can still see the reveal.
`history/budget-and-inputs.md` holds the Simulator investigation behind this.

The chip shows only while the draft leaves the month unbalanced either way and
the filled plan is between
$0 and `MAX_ENTRY_CENTS`, so an overage larger than
the item's saved plan offers no chip there; an expression in progress takes the
slot back for its result preview. The chip is a size container and its amount
shrinks from 16 px to fit its width (`--amount-chars` times 0.56 em per
character, the same fit the Budget amounts use), with an 11 px floor: on a 402
px iPhone 17 Pro a cents amount such as `+$2,834.56`
shows in full at about 14 px, while on a 375 px phone amounts past about seven
characters still end in an ellipsis at the floor, since the 44 px keys leave the
chip about 62 px there. Only planned amounts (Budget rows and the line-item
detail) and transaction split amounts pass a fill, and like the rest of the bar
it exists only with a coarse pointer and an on-screen keyboard, so desktop has
no fill.

### Fill a split with what's left

Nothing in a split transaction fills itself; the two ways to finish a split are
both explicit taps. While a split amount in the transaction sheet is focused on
a phone, the operator bar offers a fill chip captioned Remaining
(`splitRemainderFill` in
`src/components/transactions/transaction-split-fill.tsx`). It sets that split to
`splitFillingRemainder` (`src/domain/budget-calculations.ts`): its draft plus
whatever of the total is unassigned. The chip reads `+$30` when something is
unassigned and `−$20` when the splits exceed the total, in which case filling
shrinks the split. It hides when nothing is unassigned, and when the filled
split would be
$0 or less, or above `MAX_ENTRY_CENTS`. A fill is offered only
once the transaction's total is above $0
and every other split has an amount, so it completes the last split instead of
dropping the whole total onto the first: with two splits still at
$0, neither gets one. On every device, including
desktop where the bar never appears, the summary's Remaining cell becomes a
button (`SplitSummary`, `.split-summary-fill`) under the same rule, reading
`Fill {item}` under the red amount. That is the one split still at $0,
or, when every split has an amount, the last split the difference can go to
without reaching $0; with no such split, the cell stays plain text. Neither path
touches the transaction's total Amount field.

The add-transaction sheets stay mounted, so `TransactionSheet` rebuilds its
whole draft (kind, merchant, amount, date, note, and splits) each time `open`
turns true, during render rather than in an effect, so the first open frame
already shows it. A sheet dismissed without saving therefore never reopens with
the old entry, and the date follows the viewed month. The draft is not cleared
on close, so the sheet keeps its contents while it animates away. Every other
draft-holding sheet follows the same rule (`sheets-and-menus.md`).

### Long expressions

A long expression must stay readable from its start: a caller's `size` grows to
the displayed text's length, a focused Budget-row planned amount may widen into
the item-name column on phones (`max-width: calc(100vw - 122px)` instead of the
200 px cap) and on desktop grows leftward past its 104 px column over the name
(the planned column is a flex-end container and the focused input `flex: none`
on a white background), and `fitExpression` in `currency-input/index.tsx` steps
the expression's font down to 11 px until it fits, clearing the inline size when
the field leaves expression mode.

### Floating chrome while editing

While a Budget-row planned amount (`.budget-row-grid .inline-money-input`) has
focus, `PlanInput` marks the document with `data-editing-plan` and
`:root[data-editing-plan]` rules in `budget.css` slide the mobile bottom
navigation down off the screen by `--bottom-nav-hidden-offset` (0.34 s on
`cubic-bezier(0.32, 0.72, 0, 1)` after a 0.15 s delay) and then hide it with
`visibility: hidden`, and blur puts it back instantly: the transition lives only
on the hiding rule, so leaving it has none. `display: none` is avoided because
showing the nav again would replay its `bottom-nav-enter` entrance. Use the
mark, never a `:root:has(... :focus)` selector: WebKit re-checks such a selector
on every focus change anywhere in the document, and half sheets began jumping as
the keyboard opened once several existed. Blur clears the mark only after the
current task, and not at all when focus has landed on another planned amount,
because layout reads between the blur and the next focus would otherwise restyle
the page without it and restart the navigation's hide delay on every switch.

The same mark clears the rest of the chrome floating over the rows, smoothly
rather than instantly. The docked Left to budget strip slides back up under the
header by its height plus its shadow reach, through the individual `translate`
property so it composes with the scroll-driven `transform`, over 0.35 s on
`cubic-bezier(0.45, 0, 0.2, 1)` both ways; its header shadow
(`.budget-balance-clip::after`) moves up out of the clip with it, because
transitioning its scroll-derived `opacity` instead would lag the scroll. The
title bar stays in place. On touch screens (`pointer: coarse`) Better Buddy runs
off his edge with the same `buddy-leave` animation the chat uses and ignores
pointers, and when the field blurs the rule stops matching, so the launcher's
`buddy-arrive` restarts and he flies back in as after closing the chat. A mouse
edit leaves him in place.

**Why planned amounts use still focus.** When iOS slides the page toward a
focused field, everything about to leave the top of the screen (header, Left to
budget strip, first rows) paints blank white for the length of the slide, likely
because the root does not scroll (`html` and `body` are `overflow: hidden`),
which is inferred, not confirmed. WebKit reveals a focused field in two places
(`WKContentViewInteraction.mm` and `WKWebViewIOS.mm` on WebKit's main branch,
read in September 2026): (1) `_zoomToRevealFocusedElement`, deferred until the
keyboard starts to show. It returns early for `focus({ preventScroll: true })`,
and also while the selection is transparent (opacity under 0.01 including
ancestors) or clipped to nothing. (2) `_scrollToAndRevealSelectionIfNeeded`,
which `_keyboardChangedWithInfo` calls whenever the keyboard's frame changes
while it is already up and the caret was fully visible before the change. It
scrolls the caret to 4 px above the keyboard and ignores `preventScroll`. The
iOS keyboard reports its frame twice as it opens (a partial height, then the
full one), so this second path runs on every open, and `preventScroll` alone is
not enough.

So a tap on an unfocused planned amount cancels the `touchend`, which stops
iOS's own tap-to-focus, and calls `focusStill`, the one no-scroll focus;
`SwipeReveal` uses it too for an editable target (touch taps park, mouse clicks
only skip the scroll), since it would otherwise focus the field itself on
`pointerup` with a plain `focus()`. `focusStill` calls `parkWhileKeyboardOpens`
before focusing with `preventScroll`. That function moves the field 10,000 px up
with the `translate` property and lays an inert copy (`createStandIn`: a clone
with the same classes and value, `aria-hidden`, `inert`, and ignoring pointers)
in its place, so the row looks unchanged. The caret is then off-screen for both
reveal paths. This is the approach Uno Platform documented for the same two
paths (unoplatform/uno#24526 and #24527). The field comes back when the keyboard
has held its size for 150 ms (`KEYBOARD_SETTLE_MS`), when it blurs, or after 1.2
s (`PARK_LIMIT_MS`), and the caret is set to the end again so iOS shows it.
Nothing is parked while the keyboard is already up, because no frame change
follows then.

`revealAboveKeyboard` then waits for the keyboard's `visualViewport` resize and,
if the field (or its stand-in while parked) would sit behind the keyboard and
the 56 px calculator bar, smoothly scrolls `.app-content` just far enough to
clear them (16 px clearance), so only the list moves. It also scrolls far enough
that the next field's center does not sit under the bar (it stops 16 px above
it): the keyboard's next arrow skips any field whose center another element
covers, and within a category the next row, 79 px down, otherwise lands right
under the bar. A field behind the keyboard is still reachable, because the
keyboard is not page content. The up arrow can still stop at the first item of a
category, because iOS decides whether an arrow works when a field takes focus,
before the smooth scroll moves the list, and the item above is then off-screen;
snapping the list instead of gliding would fix it, and was declined. It also
checks once on the next frame, for a field focused while the keyboard is already
up. Rows near the end of the list could never scroll that far, so
`lendScrollRoom` gives `.app-content` an inline bottom padding for the shortfall
and grows it for later fields, easing it back out once the keyboard has closed
(`easeRoomBack`, above). A touch that moves more than 10 px is a scroll or swipe
and keeps the native behavior.

The up and down arrows above the keyboard move focus natively, where no
`preventScroll` can be passed. For those, the focus handler calls
`veilNativeFocus`: any focus while the keyboard is up that `focusStill` did not
make turns the field transparent (`opacity: 0`) behind the same stand-in for 300
ms (`VEIL_MS`). WebKit computes the post-focus editor state before it runs the
deferred reveal, and a transparent field suppresses that reveal, as in (1)
above. The veil keeps the field in place, not parked, because a native focus
also runs the browser's own reveal, which scrolls the list to the field's box
and would throw the list to the top if the box were parked. The 300 ms window
has not been measured on device. Lengthen it if the arrows still slide the page.

While the keyboard is up, WebKit makes the page itself scrollable by the
keyboard's height (`hasDockedInputView` in `WKWebViewIOS.mm`), so a drag past
the end of the list, or on the header, slides the page, and the script-placed
calculator bar chases it a frame behind. So while the mark is set,
`.app-content` takes `overscroll-behavior-y: contain` (WebKit stops handing the
list's vertical scroll to the page, and the list still bounces for pull to
refresh), and `.mobile-header` takes `touch-action: none`, so the page stays at
the top and the bar has nothing to chase. The browser's own caret reveal after
an edit (`revealSelectionAfterEditingOperation` in WebKit's `Editor.cpp`)
scrolls the page itself as well as the list and takes no option to stop it, so
`pinPageWhileFocused` listens for the window's `scroll` event while the field
has focus and scrolls the page straight back to the top. Scroll events run in
the rendering update before the frame is committed, so the move is not painted
(confirmed in the iOS Simulator, not on a physical device). A reveal that runs
later than the edit does get painted, which is why a focused field must never
change width (Fill with what is left to budget). Moving focus from one planned
amount to another keeps the mark set, so nothing returns between them.
