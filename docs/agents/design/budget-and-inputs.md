# Budget page and inputs

Read this before changing Budget rows, the summary arc, the Transactions filters, or money inputs.

## Budget rows

### Row actions

Category headers expose an edit menu; budget-item rows alone use a deliberately leftward swipe to reveal Delete. Keep the inactive swipe action fully transparent so fast vertical scrolling cannot flash its red layer.

### Amount display

The Budget page defaults its amount display to Available unless the per-device Settings preference selects Planned. Switching Planned/Available on the Budget page remains temporary and must not resize rows. From 1100 px wide the rows show Planned, Spent, and Available together and the switch is hidden, so the preference only governs narrower layouts; every row always renders all three cells and the `data-amount-view` attribute plus a `max-width: 1099.98px` rule hide the unselected ones, which keeps the switch free of remounts. The desktop Planned cell is the same inline plan input, given a soft hover fill and a blue focus ring so it reads as editable.

### Progress bars

A line-item progress bar represents the share of its starting available balance still remaining: it is full before any net spending and shrinks toward empty as spending consumes the balance, including carried-in funds and refunds. A negative balance replaces the regular fill with a coral striped warning bar and an accessible over-budget amount.

### Reordering

Reordering starts after a 350 ms long-press on the category header or item row; movement beyond 8 px before activation must cancel so vertical scrolling and item swipe-delete remain reliable. A visually hidden keyboard control must continue to support Arrow Up/Arrow Down reordering. Use a transition-free rendered drag copy inside a neutral compositor shell plus animated list reflow. Never move the source clone directly with inherited row/header transitions because that creates compositor ghosting. During a pointer drag, keep the real DOM order fixed, translate the faded placeholder into the current target slot, and move neighboring rows with interruptible transforms; commit the React/server order once on drop. Edge auto-scroll is frame-based with gradual acceleration/deceleration and continues while the pointer is held near an edge. Item reordering remains within its current category. Summary and budget progress entrance animations are one-shot and must not replay when a drag preview is created or a list order is committed.

## Summary arc

The Budget summary arc draws in with `stroke-dashoffset`, but under `preserveAspectRatio='none'` and `vector-effect: non-scaling-stroke` its dash lengths are in screen pixels, so `BudgetSummaryCard` measures the rendered length after mount, writes `--summary-arc-progress-length`, and marks the path `data-measured`. The progress path stays hidden and its draw-in (`summary-arc-in`, under `.budget-bars-enter`) does not start until that attribute is present. Server-rendered HTML paints before hydration, and without the gate the draw-in started with a zero length, showing a dot at the arc's start and then jumping partway along once the length arrived; the gap before hydration is longest under `next dev`, where it was obvious, but it exists in production too.

## Transactions filters

The Transactions page keeps its All, Expenses, and Income type pills visible and applies those inline choices immediately. Its sliders control opens a full filter sheet with transaction type, budget item, and split-status controls. Sheet changes are drafts until Apply filters is pressed; closing the sheet discards them, and the sheet's Clear filters action resets only the drafts. Applied filters give the sliders control a distinct blue treatment and active-count badge. While filters are applied, expose an outside Clear action immediately after the Income pill in the same left-aligned group, never pushed to the far edge of the row. That action resets the applied type, item, and split filters without clearing search. A populated search field exposes an accessible clear control that empties the query without returning focus to the input.

## Money inputs

### Calculator entry

Every `CurrencyInput` (`src/components/ui/currency-input/`) doubles as a calculator. Typing an operator, or tapping one on the operator bar, turns the field into an expression that starts from the current amount (`$120.00 + 5`); from then on operands are typed as dollars, not ATM-style cents, because `+ 5` should mean five dollars. `evaluateMoneyExpression` in `src/domain/money-expression.ts` evaluates it with exact bigint rational arithmetic, × and ÷ before + and −, a trailing operator ignored, and one half-up rounding to cents; results that divide by zero, go negative, or exceed `MAX_ENTRY_CENTS` are refused. Every valid intermediate result is reported through `onValueChange`, so callers that read state without a blur (the transaction sheet's Add button and single-split sync) see the result, and blur-committing callers commit it unchanged. `=` collapses to the result and keeps focus, blur collapses too, an invalid expression falls back to the last valid value, and deleting the last operator returns to ATM entry.

### Operator bar

iOS offers web inputs no calculator keyboard, so `operator-bar.tsx` portals a toolbar (result preview, ÷ × − + . =, all 44 px keys) onto the top of the native number pad: it shows only for a coarse pointer while `visualViewport` is at least 100 px shorter than the full height and unzoomed. The full height is the running maximum of the viewport height and `document.documentElement.clientHeight` at the current width (`fullViewportHeight`), never `window.innerHeight`, because iOS shrinks it along with the keyboard. The bar sits at `offsetTop + height`, following the viewport's `resize` and `scroll`. The input must never blur mid-expression, since blur commits a half-typed plan: keys prevent `pointerdown` and act on `touchend` with its default prevented, which stops iOS synthesizing the focus-moving click, while `onClick` covers VoiceOver and mouse activation; keys carry `tabIndex={-1}`. The bar lives outside any Radix dialog, so `sheet.tsx` and `navigation-detail/index.tsx` exempt `isCalculatorBarTarget` from outside-pointer dismissal, and it sets `pointer-events: auto` for the same reason as the toast (`sheets-and-menus.md`). Desktop has no bar; hardware keys `+ - * / x =` drive the same expression.

### Fill with what is left to budget

While a Budget-row planned amount is focused, the operator bar's preview slot offers a fill chip (`fill` on `CurrencyInput`, rendered by `OperatorBar`) captioned Left to budget with the amount still unbudgeted, such as `+$425`. That amount accounts for the draft: `leftToBudgetWithPlanDraft` in `src/domain/budget-calculations.ts` is the month's left-to-budget less how far the draft has moved from the item's saved plan, so typing part of an amount first shrinks the chip. Tapping it sets the field to `planFillingLeftToBudget` (the saved plan plus the month's left-to-budget), which leaves Left to budget at exactly $0 whatever the field held, and ends any expression. It presses like the operator keys, without taking focus, so the plan still commits on blur through the ordinary `updatePlan` mutation. The chip shows only while something is left after the draft and the filled plan stays within `MAX_ENTRY_CENTS`; an expression in progress takes the slot back for its result preview. The chip is a size container and its amount shrinks from 16 px to fit its width (`--amount-chars` times 0.56 em per character, the same fit the Budget amounts use), with an 11 px floor: on a 402 px iPhone 17 Pro a cents amount such as `+$2,834.56` shows in full at about 14 px, while on a 375 px phone amounts past about seven characters still end in an ellipsis at the floor, since the 44 px keys leave the chip about 62 px there. Only the Budget rows pass a fill, and like the rest of the bar it exists only with a coarse pointer and an on-screen keyboard, so desktop has no fill.

### Long expressions

A long expression must stay readable from its start: a caller's `size` grows to the displayed text's length, a focused Budget-row planned amount may widen into the item-name column on phones (`max-width: calc(100vw - 122px)` instead of the 200 px cap) and on desktop grows leftward past its 104 px column over the name (the planned column is a flex-end container and the focused input `flex: none` on a white background), and `fitExpression` in `currency-input/index.tsx` steps the expression's font down to 11 px until it fits, clearing the inline size when the field leaves expression mode.

### Floating chrome while editing

While a Budget-row planned amount (`.budget-row-grid .inline-money-input`) has focus, the mobile bottom navigation is hidden instantly with `visibility: hidden` and reappears instantly on blur, with no animation either way; `display: none` is avoided because showing the nav again would replay its `bottom-nav-enter` entrance. The rule is a `:root:has()` selector in `budget.css`. The same selector clears the two other things floating over the rows, smoothly rather than instantly. The docked Left to budget strip slides back up under the header by its height plus its shadow reach, through the individual `translate` property so it composes with the scroll-driven `transform`, over 0.35 s on `cubic-bezier(0.45, 0, 0.2, 1)` both ways; its header shadow (`.budget-balance-clip::after`) moves up out of the clip with it, because transitioning its scroll-derived `opacity` instead would lag the scroll. On touch screens (`pointer: coarse`) Better Buddy runs off his edge with the same `buddy-leave` animation the chat uses and ignores pointers, and when the field blurs the rule stops matching, so the launcher's `buddy-arrive` restarts and he flies back in as after closing the chat. A mouse edit leaves him in place. Moving focus from one planned amount to another keeps the selector matching, so nothing returns between them.
