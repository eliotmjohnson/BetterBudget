# Bill reminders

Read this before changing bill settings, the reminder rules, the scheduler, the
push routes, `public/sw.js`, or how a tapped notification opens the app.
`AGENTS.md` keeps the one-line guardrails; `docs/agents/product.md` describes
the user-facing capability and `docs/agents/deployment.md` the host side.

Per-item Web Push alerts were user-directed on 2026-10-13 (6.12.0). They are the
only notification the product sends.

## Settings and rules

- **Bill settings live on the item definition** (`bill_reminder_enabled`,
  `bill_due_day`, `bill_lead_days` on `budget_items`, versioned by the
  definition version) and repeat every month.
  `monthly_budget_items.bill_due_day_override` moves one month's due day and is
  never copied. Due days 29–31 clamp to a short month's last day.
- **The rules are pure, in `src/domain/bill-reminders.ts`.** One upcoming alert
  from the lead day through the due day, and one overdue alert from the day
  after the due date through the third day after it, each only while the item
  has no live _expense_ split in that month; refunds do not count. A month
  nobody has created yet uses the previous month's plan row to decide
  participation. Archived items never alert.

## Delivery

- **At most once.** `bill_reminder_deliveries` is unique on (item, month, kind);
  the scheduler claims the row before sending, releases it only when every
  device failed transiently, and does not claim it at all while the household
  has no subscribed device. Changing the due date after an alert has gone out
  does not send a second one for that month and kind.
- **Retention.** Each run from 9 AM deletes delivery rows whose month is more
  than three months back (`DELIVERY_RETENTION_MONTHS`); the scheduler only ever
  checks the previous, current, and next month, so no pruned row can still be
  needed. A dry run deletes nothing.
- **The scheduler runs in the app process.** `src/instrumentation.ts` starts a
  30-minute loop that does nothing before 9 AM America/Chicago and catches up on
  any later tick that day. It relies on exactly one application container; the
  delivery ledger still keeps a second process from double-sending.
- **The VAPID key pair is generated into Postgres on first use**
  (`push_vapid_keys`, one row, insert-if-absent then read back). This is the one
  secret stored in the database and is user-directed: the key can only sign
  pushes to endpoints held in the same database, so it adds nothing a database
  leak would not already expose. It lives in EBS snapshots, and a fresh database
  means every device turns notifications on again. Do not move it to the AWS
  secret without direction.
- **Delivery needs no new egress.** Apple, Google, and Mozilla push endpoints
  all resolve over IPv6, which the IPv6-only production host already reaches.

## Service worker and notification taps

- **The service worker (`public/sw.js`) only handles `push` and
  `notificationclick`.** It has no fetch handler and caches no responses, and it
  is registered only when a device turns notifications on. iOS delivers Web Push
  only to the installed home-screen app (iOS 16.4+).
- **Pushes are Declarative Web Push messages**
  (`{ web_push: 8030, notification: { title, body, tag, navigate } }`, built in
  `src/server/push/send.ts`, with `navigate` absolute on `BETTER_AUTH_URL`). iOS
  18.4+ shows them and navigates on a tap without running the service worker,
  which matters because WebKit does not dispatch `notificationclick` for a push
  notification tapped while the home-screen app is running (WebKit bug 282935; a
  reinstall did not help on the user's phone, while a notification shown by the
  worker itself worked in the simulator). The messages are not `mutable`, so a
  supporting browser fires no `push` event; every other browser delivers the
  JSON to the worker's `push` handler, which shows the same notification and
  also accepts the older flat `{ title, body, tag, url }` payload.
- **Without declarative support, a tap opens the item through the app, not
  through iOS.** The click handler first writes the target URL and a timestamp
  to the `better-budget-notification-target` Cache Storage entry, then focuses
  the open window and posts it a message, or opens a window when none is open.
  `useNotificationTarget` in the app shell consumes that entry on mount, on
  becoming visible, and on the message, and routes there when it is under two
  minutes old. So the item opens whichever page iOS resumes or launches and
  whether or not `WindowClient.navigate` or the `openWindow` URL is honoured.
  The cache name, key, and message type are duplicated in `sw.js` and the hook;
  change them together.
- **iOS adds a "from <app name>" subtitle line** under every Home Screen web app
  notification's title. WebKit's push daemon (`showNotification` in
  `Source/WebKit/webpushd/WebPushDaemon.mm`) sets it unconditionally from the
  Home Screen icon's name, for declarative and worker-shown notifications alike,
  and nothing in the payload can change or hide it. It sits on its own line, so
  it takes no room from the title.
