# Better Buddy server rules

Read this before changing the assistant's route, prompt, tools, model settings,
or how its writes reach the budget. `AGENTS.md` keeps the one-line guardrails;
`docs/agents/design/assistant.md` owns the launcher and chat sheet, and
`docs/agents/releases.md` the Version 5 release story.

Better Buddy is an optional assistant on Claude Haiku 5.5, a floating robot
button on every authenticated page that opens a chat. It answers questions about
the household's budget and commits basic changes.

- **Assistant writes go through `applyBudgetMutation`.** Every tool builds a
  `BudgetMutation`, parses it with `mutationSchema`, and commits it with a fresh
  `clientMutationId` and the `expectedVersion` from a snapshot read immediately
  before. Never give the assistant a write path around the mutation service.
- **No new tool without explicit user direction**, and in particular none for
  archiving, deleting definitions, copying, clearing, resetting, or reordering.
  Deleting received-income receipts and income sources was user-directed on
  2026-10-12. `delete_income_source` deletes the source and its receipts in one
  mutation. When the source has received income it requires `received_amount`,
  the total the person confirmed, and refuses if the total no longer matches, so
  a receipt recorded after the confirmation is never deleted unseen.
- **Assistant writes are server-confirmed.** The client applies no optimistic
  patch; it invalidates every cached `budget-snapshot` query after a turn that
  reports changed months, because carryover can move later months.
- **The cached prefix is frozen.** `SYSTEM_PROMPT` and `ASSISTANT_TOOLS` must
  contain no per-request value and must keep a deterministic order, and together
  they must stay above Haiku 5.5's 512-token minimum cacheable prefix, or every
  request pays full input price. Today's date and the viewed month travel in a
  text block at the start of each person turn instead. The server warns
  `prompt cache unused` when a response reads and writes no cache.
- **The conversation is client-held and stateless on the server.** The browser
  sends the whole message history each turn; the route validates its shape and
  size, and the household always comes from the session. Tool results the client
  sends back only affect the model's context, never authorization.
- **The assistant is off without `ANTHROPIC_API_KEY`.** The button is not
  rendered and the route answers `unavailable`. Production validation rejects a
  placeholder key and accepts an absent one. With a key, the Settings **Better
  Buddy** switch and beaming him up to his spaceship both write the per-device
  `better-budget-assistant-v1` cookie through `changeAssistantEnabled` in
  `app-client.tsx`; it is a display preference, not an access control.
- **Replies are plain text.** The chat renders no Markdown, so the prompt
  forbids it and `run.ts` strips `**`/`__` emphasis from model text.
- **Model settings.** Keep the model on the cheapest current Claude model with
  thinking explicitly disabled unless the user directs otherwise. Haiku 5.5
  thinks when `thinking` is omitted, and the client-held history keeps no
  thinking blocks to send back with tool results. Keep the per-turn call cap,
  the conversation cap, and the per-household rate limit.
