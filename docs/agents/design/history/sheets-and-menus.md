# Sheets, menus, and toasts: history

The investigations and superseded builds behind the rules in
`../sheets-and-menus.md`. Read a section here before reverting or reworking the
rule it explains; the topic file holds the current contract.

## Sheets

### Dim and entrance

When a field in a sheet takes focus, iOS moves fixed layers down by about the
status bar's height for a frame or two before it slides the page up for the
keyboard. Screen recordings of the Better Buddy composer showed a flat-edged
overlay leave an undimmed white band across the status bar and header while that
happened. The overlay was transparent before the dim existed, so the shift had
been invisible. That is why the overlay bleeds a full `--viewport-height` past
both edges.

### Drag and dismissal

Until 5.9.4 the exit used the entrance family's `cubic-bezier(0.4, 1, 0.4, 1)`,
which spends most of its travel in the first frames: a phone screen recording of
the Move money sheet showed it dropping about 200 pt in the first frame and
leaving the screen in about 130 ms, with the dim gone as fast, which read as the
sheet snapping shut. The exit now borrows the Better Buddy chat's curve.

Until 6.0.2 the item delete sheet's `open` was `deleteItemTarget !== null`, so
Cancel cleared the target and the sheet collapsed to its shorter "Delete this
item?" fallback in the first frame of its exit, which a phone recording showed
as an abrupt close beside the category delete sheet.

Until 6.0.3 Add income source, Record income, and Change password cleared their
fields only after a successful save, so a dismissed draft reappeared, and Import
backup kept Replace selected.

### Layout

The Expense/Income selector's green is a brighter shade of the Budget page's
Remaining green `#199d67`, which read as too dull there.

Pinned by `bottom: 0`, the taller half sheets (Edit category about 620 px, Add
and Edit transaction about 790 px on an 874 px iPhone) lurched as the keyboard
opened: screen recordings showed a first jump before the keyboard appeared, a
glide, and a second jump that parked the title under the Dynamic Island, while
the page moved only about 160 px against a 340 px keyboard. The short Add line
item sheet, which rides up the keyboard's full height, and the top-pinned
full-screen sheet, whose partial moves stay smooth, never did, which suggests
iOS moves bottom-pinned fixed elements on its own schedule while the keyboard
opens, and that the two moves fight when they differ. That reading is inferred
from those recordings and unconfirmed. The Better Buddy chat kept `bottom: 0`
until 5.13.4, with its own keyboard layout (`assistant.md`).

A `tall-mobile` variant, the `capped-mobile` height as a fixed `height`, held
the Move money sheet's top still while its preview appeared and its limit state
changed; it was removed in 6.0.1 once that preview was always shown and the
sheet's selector and **Move** button had moved into its header, leaving content
that no longer changes height.

Move money passes `followKeyboard` from 6.0.1: content-sized at about 630 pt, it
reaches its `max-height` partway up the number pad, and the staged fit rose its
top part way and then took the rest from its body in the 100 ms `adjust` step,
which read as abrupt beside Add line item, a short sheet that grows by the whole
inset in one motion.

The Record income date ran past the sheet's right edge until 6.0.0, when every
date field moved into `.date-input-shell`.

### Keyboard fit

The Better Buddy chat joined `useKeyboardFit` in 5.13.4; `assistant.md` records
its former layout.

The inset is held across field switches because moving to a field whose keyboard
is shorter or taller, such as the number pad (27 pt shorter than the text
keyboard with its QuickType bar on the recorded iPhone), otherwise slid the
whole sheet on every switch between Name and Planned this month. An earlier
build held the inset for as long as the keyboard stayed up, and a recording of
the Add transaction note showed why it must still follow the keyboard as it
opens: iOS reported the keyboard without its suggestions row first and added the
row a moment later, so the held inset left the sheet's last 17 pt, the Add
transaction button, behind the keyboard's toolbar.

The inset's motion was fitted frame by frame to a 60 fps recording of the iOS
keyboard on the Add line item sheet: rising stays within 11 pt of the keyboard's
top edge at every frame, and lowering within 5 pt. A build that started lowering
16 ms late instead trailed the closing keyboard by up to about 100 pt, a white
band above it.

The shield exists because the iOS 26 keyboard is translucent: a recording of the
Add transaction note showed the body's green totals and blue button sliding
under its glass. The transition starts in the animation frame after the viewport
resize, a frame after the keyboard starts moving, and the keyboard covers a
quarter of its travel in that first frame, so the inset trailed its edge by up
to 95 pt. The shield replaced an earlier build that led the inset itself by 24
ms, which could not help a sheet whose inset must move slower than the keyboard:
Edit category's Save button and colors showed through the keyboard while it
grew. Until 5.13.4 the shield was a child of the sheet; `.sheet-content` clips
its children to its own height, and a sheet that grows to make room trails the
keyboard on purpose, so a shield inside a short sheet such as Add line item
could not reach above the sheet's top while it grew, and the dimmed page showed
through the keyboard until the sheet caught up.

Easing the whole inset out held Edit category's top still for about 85 ms after
the keyboard started down (a 60 fps recording in September 2026), since a sheet
at its cap does not move until its inset falls below the growth it made, which
left a white band above the closing keyboard; hence `insetInHeight`. A body
scrolled down with the keyboard up was then pulled back in one frame as it
lengthened (Edit category and Add income source, reproduced in the iOS
Simulator's installed web app in September 2026), which `settleBodyScroll`
fixes. For a sheet whose height the inset does not change, dropping its whole
inset at once and shifting the content back showed a blank frame in the
Simulator, because iOS applies the scroll a frame apart from the shift.

A 60 fps phone recording of Change password (September 2026) showed the sheet
sometimes reach its full height two frames after it started moving, well ahead
of the keyboard, on a progress curve that matched the 100 ms motion exactly: the
first check measured little or no cover, so the rise started toward nothing and
the real cover a frame later arrived as a 100 ms change. Forcing a zero first
cover in the iOS Simulator reproduced the snap, and retargeting the rise
(`risingUntil`) made the sheet rise with the keyboard. What made the first check
read short on the phone is not confirmed.

A growing sheet that led the keyboard made its top edge leap in the first frame.
Edit category reaches its `max-height` partway, and easing the whole inset
raised its top edge quickly and stopped it dead at the cap, which read as
abrupt. The first version borrowed the chat's 520 ms on
`cubic-bezier(0.32, 0.72, 0, 1)` after a 60 ms delay, and in the recording the
sheet started four frames after the keyboard and was still growing 250 ms after
the keyboard had stopped.

Without the empty-field space trick in `hideCaretIn`, the selection did not
change at all, and on the phone the caret of an empty Change password field
stayed visible while the sheet was dragged (September 2026); the iOS Simulator
hides the caret either way, so only the phone shows the difference.

A tap on the header used to wait out the 450 ms spring before the fit lowered.
An earlier build blurred the field as soon as the drag moved, which dropped the
keyboard under the finger and was replaced at the user's request. A first
version in the 5.13.0 work lifted the whole sheet onto the keyboard with
`translate` and capped its height; it was dropped before release, because a
sheet that moves reads worse than one that stays put and grows.

### Focus

Sheets lost their visible close control in 5.13.0. The sheets open from
controlled state rather than Radix's `Dialog.Trigger`, so before 5.13.1 Radix
returned focus to nothing: closing Add transaction with Escape left focus on the
page body, and Tab started over from the top.

## Hold menu

### Layers and the lifted row

An earlier version of the clone stayed widened while it faded out and read as a
mismatched component. Measuring the row with its transform made the clone about
3% narrower than the row, because a held row is still easing back from its 0.97
pressed scale when the menu opens. Hiding the original row when the hold fired,
rather than in the clone's ref callback, left a frame with neither and the row
flashed.

### Held-finger selection

The menu can open under a finger that never moved, and lifting it then silently
ran Delete, hence the 10 px slop. A 600 ms blanket click-swallowing window made
an immediate tap on Delete do nothing.

### Exit and stacking

The shorter fast-start settle made the clone's return look abrupt when it had
been slid up. Before `data-exit='action'`, the settling clone and fading blur
drew over the sheet Edit opens. When the overlay outlasted the clone, the row
was revealed under a faint residual blur while the clone above the overlay was
sharp, which read as a slight shift.
