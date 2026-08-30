# Plan: SMS assistant with LLM-generated replies

> Version 2. Synchronised with spec v2 (`docs/specs/sms-llm-chat.md`).
> Changelog at the end of the document.

Stack: NestJS + TypeScript, PostgreSQL + Prisma, JWT for the admin API, real
Twilio + OpenAI providers behind interfaces (mock is the default when no keys
are present). `docker compose` brings up Postgres locally.

## Key architectural decisions

**1. The webhook acknowledges immediately; processing happens afterwards.**
The controller validates the signature, normalizes the payload, publishes an
event and returns an empty `204`. A separate handler listens for the
processing. The implementation is the built-in in-process event bus
(`@nestjs/event-emitter`), not an external queue.

Why an event bus rather than `setImmediate`/a floating promise: the controller
knows nothing about the LLM or the database at all — it merely announces "a
message arrived". Swapping the in-process bus for BullMQ in production means a
new listener, with the controller unchanged. This is literally the boundary
the assignment asks to see ("could this approach support more users later").

A deliberate consequence: if the process dies between the acknowledgement and
sending the SMS, the message is lost. This is documented in the spec and in
the README as the first item under future improvements.

**2. Idempotency lives in the database, not in an existence check.**
`providerMessageId` carries a unique constraint; the insert is attempted and
the conflict caught (`P2002`), rather than doing a `SELECT` first. Check-then-
insert is a textbook race condition: two concurrent Twilio retries both pass
it.

**3. Signature verification is a guard, not code inside the controller.**
`TwilioSignatureGuard` is active only when `SMS_PROVIDER=twilio`; for the mock
it lets everything through. It uses `validateRequest()` from the official SDK.

**4. A provider is responsible for transport only.**
`ISmsProvider` is `sendMessage()` + `parseIncoming()`. The business logic
(recognise a rating, decide whether to call the LLM) lives in
`IncomingMessageHandler` and is not duplicated across provider
implementations.

## Architecture (NestJS modules)

```
src/
  config/                     — typed configuration + .env validation (zod), fail fast at startup
  common/
    phone.util.ts             — E.164 normalization (libphonenumber-js)
    text.util.ts              — truncation to the SMS limit
  prisma/
    prisma.module.ts
    prisma.service.ts
  sms/
    sms-provider.interface.ts — ISmsProvider: parseIncoming(), sendMessage()
    sms-provider.token.ts     — DI token
    providers/mock-sms.provider.ts
    providers/twilio-sms.provider.ts
    guards/twilio-signature.guard.ts
    dto/incoming-sms.dto.ts
    sms.controller.ts         — POST /webhook/sms, POST /webhook/sms/twilio → emit + 204
    sms.module.ts             — useFactory: picks the implementation by SMS_PROVIDER
  llm/
    llm-provider.interface.ts — ILlmProvider: generateReply(message): Promise<string>
    llm-provider.token.ts
    providers/mock-llm.provider.ts
    providers/openai-llm.provider.ts
    llm.module.ts
  conversations/
    conversation.repository.interface.ts — IConversationRepository (DIP)
    conversation.repository.ts           — Prisma implementation
    conversations.service.ts
    dto/conversation-response.dto.ts     — serialises the status in lowercase
    conversations.module.ts
  messaging/
    incoming-message.handler.ts  — @OnEvent('sms.received'): the whole business flow
    feedback-parser.ts           — a pure function: SMS body → Feedback | null
    events/sms-received.event.ts
    messaging.module.ts
  admin/
    auth/
      auth.service.ts, auth.controller.ts   — POST /admin/login → JWT
      jwt.strategy.ts, jwt-auth.guard.ts, roles.guard.ts
    admin.controller.ts        — GET /admin/conversations?phoneNumber=
    admin.module.ts
  app.module.ts
  main.ts

prisma/schema.prisma + migrations/
test/unit/*.spec.ts, test/e2e/*.e2e-spec.ts
docker-compose.yml, .env.example, README.md
```

**SOLID rationale:** SRP — the controller accepts, the handler orchestrates,
the providers transport, the repository persists. DIP — the handler depends on
`ISmsProvider`/`ILlmProvider`/`IConversationRepository`, not on
Twilio/OpenAI/Prisma. OCP — a new SMS provider is a new class plus a line in
the factory. DRY — the factory pattern is identical for SMS and LLM; number
normalization and text truncation each live in exactly one place. KISS — no
CQRS, no event sourcing and no home-grown DI container where the framework's
own facilities suffice.

## Database schema

```prisma
model Conversation {
  id                 String   @id @default(cuid())
  phoneNumber        String                        // E.164
  incomingMessage    String
  llmResponse        String?
  providerMessageId  String   @unique              // idempotency key
  providerTimestamp  DateTime?                     // time according to the provider
  status             ConversationStatus @default(RECEIVED)
  feedback           Feedback @default(NONE)
  deliveryStatus     String?                       // reserved, status webhook not implemented
  errorMessage       String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([phoneNumber, createdAt])
}

enum ConversationStatus { RECEIVED  RESPONSE_GENERATED  COMPLETED  FAILED }
enum Feedback          { POSITIVE  NEGATIVE  NONE }
```

The `[phoneNumber, createdAt]` index serves both the admin lookup and finding
the most recent completed conversation for a rating.

## Implementation steps

### Step 1 — Skeleton
- `nest new`, TypeScript strict, ESLint/Prettier.
- `docker-compose.yml` with Postgres 16 (volume + healthcheck).
- `.env.example`: `PORT`, `SMS_PROVIDER`, `TWILIO_*`, `LLM_PROVIDER`,
  `OPENAI_API_KEY`, `LLM_MODEL`, `DATABASE_URL`, `JWT_SECRET`,
  `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SMS_MAX_LENGTH`.
- `config/` — a zod schema, validated at startup (fail fast).
- **Check:** `docker compose up -d` + `npm run start:dev` come up;
  `GET /health` → 200; starting with `DATABASE_URL` missing fails immediately
  with an understandable message.

### Step 2 — Prisma + Conversations
- The schema above, `prisma migrate dev`.
- `PrismaService`, `IConversationRepository` + the Prisma implementation.
- `ConversationsService`: `createIfNotExists()` (catches `P2002` → returns a
  duplicate marker), `attachLlmResponse()`, `markCompleted()`, `markFailed()`,
  `findLatestCompletedByPhone()`, `findAllByPhone()`.
- **Check:** a unit test of the service with a mocked repository; a separate
  case where the repository throws `P2002` and the service reports "duplicate"
  instead of rethrowing.

### Step 3 — SMS provider abstraction + signature
- `ISmsProvider`, `MockSmsProvider` (keeps what it sent in memory for tests),
  `TwilioSmsProvider` (`parseIncoming` reads `From`/`Body`/`MessageSid`/
  `DateSent` from the form-encoded body; `sendMessage` uses the REST API).
- `TwilioSignatureGuard` built on `validateRequest()` from the `twilio` SDK;
  a no-op when `SMS_PROVIDER=mock`.
- A factory in `sms.module.ts` keyed on `SMS_PROVIDER`.
- **Check:** unit tests for parsing both formats; a guard test — a valid
  signature passes, an invalid one gives 403; a test that the mock records
  what it sent.

### Step 4 — LLM provider abstraction
- `ILlmProvider`, `MockLlmProvider` (deterministic keyword-based answers),
  `OpenAiLlmProvider` (Chat Completions, a system prompt saying "be brief, up
  to ~300 characters, this is an SMS", and a request timeout well below what
  common sense allows — ~10s).
- A factory keyed on `LLM_PROVIDER`.
- **Check:** a unit test for the mock's determinism; `OpenAiLlmProvider` with
  a mocked SDK client, so tests make no real calls.

### Step 5 — Receiving and acknowledging
- `sms.controller.ts`: guard → `parseIncoming()` → number normalization →
  `eventEmitter.emit('sms.received', event)` → `204 No Content`.
- The controller does not wait for the processing result and knows nothing
  about the LLM or the database.
- **Check:** an e2e test — POST to the webhook returns 204 in under 500ms even
  when the mock LLM deliberately "thinks" for 3 seconds.

### Step 6 — Processing orchestration
`IncomingMessageHandler.handle(event)`:
1. `feedbackParser(body)` → if it is a rating: `findLatestCompletedByPhone()`
   → update (or log its absence) → return, with no LLM and no SMS.
2. `createIfNotExists()` → if it is a duplicate, return (log) — idempotency.
3. `generateReply()` in try/catch → success: `attachLlmResponse()`;
   failure: `markFailed()` + a fallback text for the customer.
4. `truncateForSms()` → `sendMessage()` in try/catch → success:
   `markCompleted()`; failure: `markFailed()`, log.
- No error here surfaces in the HTTP response — that response is already sent.
- **Check:** unit tests with mocked dependencies — happy path, LLM fails, SMS
  fails, the input is a rating, the input is a duplicate.

### Step 7 — Admin auth + endpoint
- `POST /admin/login`: the username comes from `.env`, the password is checked
  against `ADMIN_PASSWORD_HASH` (bcrypt) → a JWT with `role: 'admin'` and a
  short TTL. The README carries a one-line command for generating the hash.
- `JwtAuthGuard` + `RolesGuard` on `GET /admin/conversations`.
- The number from the query is normalized by the same `phone.util`.
- The response is serialised through a DTO (status in lowercase).
- **Check:** e2e — no token 401; a token without the role 403; a valid token
  200 with a correct list; `?phoneNumber=36123456789` finds records stored as
  `+36123456789`.

### Step 8 — E2E of the core flow
- `sms-flow.e2e-spec.ts`: mock providers via `overrideProvider`, a real test
  Postgres → POST to the webhook → wait for processing → check the database
  row and the outbound message recorded by the mock.
- `idempotency.e2e-spec.ts`: the same `MessageSid` twice → one row, one LLM
  call, one outbound SMS.
- `feedback.e2e-spec.ts`: a conversation → "👍" → `feedback = POSITIVE`, no
  new conversations created, nothing sent.
- **Check:** `npm test && npm run test:e2e` green on a clean database.

### Step 9 — README + final run
- Install/run, env vars, a curl example for the local webhook, wiring up real
  Twilio (ngrok + a number + where to get the URL), wiring up OpenAI, the
  admin flow (login → token → request).
- Design decisions: the event bus instead of synchronous processing (with the
  explanation about Twilio's 15-second timeout), idempotency through a unique
  constraint, providers behind interfaces, why Postgres from the start.
- Future improvements: a durable queue (BullMQ) instead of the in-process bus,
  dialogue context for the LLM, retries with backoff, the delivery status
  callback, rate limiting, real admin roles, CI/CD.
- Clear out the leftovers, check `.env.example` against `config/`, run the
  linter and all the tests.

## If the scope has to be cut

In order, from least painful:

1. `idempotency.e2e-spec.ts` — keep the logic, move the coverage into a unit
   test of the handler.
2. Leave `OpenAiLlmProvider` and `TwilioSmsProvider` implemented but without a
   live run against a real account; say so honestly in the README —
   "implemented, not exercised against real keys".
3. Shorten Design decisions in the README to bullet points that refer to this
   file.

What does not get cut under any circumstances: acknowledging the webhook
without waiting for the LLM, idempotency, the signature guard, separating the
providers behind interfaces, admin auth, and an e2e test of the core flow.

## Definition of Done

- Steps 1-9 done, or explicitly moved to future improvements with a reason.
- `docker compose up -d` + a `.env` with no real keys whatsoever → the full
  webhook → LLM(mock) → SMS(mock) flow works.
- A repeat POST with the same `MessageSid` creates no second record.
- `npm test && npm run test:e2e` green.
- The README lets a stranger bring the project up without further questions.

## Changelog

**v2** — synchronised with spec v2:
- the "orchestration" step was split into step 5 (receive + acknowledge
  immediately) and step 6 (process via the event bus) — previously a single
  step waited for the LLM before responding to the provider, which contradicted
  the plan's own decision;
- added `TwilioSignatureGuard` (step 3);
- added idempotency through a unique constraint plus `P2002` handling
  (steps 2, 6, 8);
- added `common/phone.util.ts` (E.164) and `common/text.util.ts` (the SMS
  limit);
- added `providerTimestamp` and `deliveryStatus` to the schema;
  `providerMessageId` became mandatory;
- `ADMIN_PASSWORD` → `ADMIN_PASSWORD_HASH` (bcrypt), with generation
  instructions in the README;
- added DTO serialisation of the status in lowercase;
- added an explicit cut order and a list of what does not get cut.
