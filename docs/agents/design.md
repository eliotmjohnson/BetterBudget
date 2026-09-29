# Approved product design

Read this before changing layout, motion, gestures, sheets, swipes, reordering,
navigation-detail behavior, or any other interaction contract. It holds the
palette, reference viewports, and desktop layout; each interaction contract
lives in one topic file under `docs/agents/design/`. Read only the topic you
are changing.

`AGENTS.md` owns the standing rule against replacing the visual language. This
file owns the palette and the reference viewports, and indexes the interaction
contracts built on them.

| Read before changing                                                                                                 | File                                       |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| The pushed detail view, its collapsing title and header shadow, or either docked summary strip                       | `docs/agents/design/navigation-detail.md`  |
| Sheets, the transaction hold menu, or toasts                                                                         | `docs/agents/design/sheets-and-menus.md`   |
| Bottom navigation, continuous corners, safe areas, touch guards, pull-to-refresh, page entrance, or landscape phones | `docs/agents/design/shell-and-platform.md` |
| Budget rows, reordering, the summary arc, Transactions filters, or money inputs and the calculator                   | `docs/agents/design/budget-and-inputs.md`  |
| The Better Buddy launcher, its throw, fall, and spaceship, or the chat sheet                                         | `docs/agents/design/assistant.md`          |

When a contract changes, update the topic file that owns it. Add a new topic
file, and a row here, only when a new area does not fit an existing one.

## References, viewports, and palette

The approved visual references are stored in `docs/design/`:

- `budget-responsive.png`: primary budget and responsive layout.
- `brand-system.png`: wordmark and app icon.
- `transactions.png`: transaction list, editing, and split flows.
- `auth-income-organizer.png`: sign-in, income, month copying, and organization.

Important responsive reference viewports are 390 x 844 for mobile and
1440 x 1000 for desktop.

The visual system is deliberately iOS-like and restrained: true-white surfaces,
charcoal text, and cool-gray dividers; cornflower blue `#1769E0` as the primary
action color; and mint `#55D49B`, sky `#9FC0FF`, yellow `#FFD977`, coral
`#FF7E83`, and lilac `#B6A6FF` as semantic accents. Pastel category medallions,
tactile sheets, rounded cards, lightweight CSS/SVG charts, a mobile bottom
navigation, and bottom-sheet interactions carry the rest. Desktop uses a slim
left navigation, a primary budget column, and a summary/activity rail.

### Desktop layout

The
scroll container spans the whole main panel so its scrollbar sits at the window
edge, and each screen centers its own width inside it. Below 1100 px the 190 px sidebar cannot fit the wordmark, so it shows the
centered icon alone, as the landscape-phone layout does. On desktop the category
header's menu column is 44 px, the button's full width: `.category-section` uses
`content-visibility: auto`, whose paint containment clips anything past its edge,
so the narrower phone column cut off the right of the hover circle. Between 760 and 1019 px the rail leaves the
budget column under 500 px, too narrow for the desktop bars, so the summary card
keeps the phone arc there and switches to the bars from 1020 px. The rail sticks 24 px
below the header, which is exactly where the summary card starts, so it never
jumps when scrolling begins. The header gear opens month actions on Budget and
Settings elsewhere; on desktop it is hidden outside Budget because the sidebar
already has Settings. The rail leads with Add transaction on desktop, so the
in-page Add transaction button is hidden from 760 px and shown again by the
landscape-phone block, where the rail is hidden. Recent transactions rows in the
rail open the edit transaction sheet, and an empty month says so instead of
leaving the heading bare.
Interactive targets are at least 44 px, with safe-area padding, keyboard focus
management, accessible status announcements, and reduced-motion support.

## General rules

- A slim desktop left navigation, primary budget column, and summary/activity rail.
- At least 44 px interactive targets, plus safe-area padding, keyboard focus management, accessible status announcements, and reduced-motion support.

Do not replace the established brand or visual language with a generic dashboard theme. Extend existing primitives and tokens first.
