# SMS + LLM Chat Service

Backend that receives incoming SMS, answers them with an LLM-backed agent, sends
the answer back over SMS, records thumbs-up/down feedback, and exposes the
conversation history to admins.

Runs end-to-end with **no external accounts or API keys** — mock SMS and mock LLM
providers are the default. Add Twilio and OpenAI credentials to `.env` and the
same code paths use the real services.

---

## Quick start

```bash
git clone <this-repo> && cd sms-llm-chat
npm install
cp .env.example .env          # works as-is, no keys needed
docker compose up -d          # PostgreSQL on :5432
npm run start:dev
```

Send a message:

```bash
curl -i -X POST localhost:3000/webhook/sms \
  -H 'Content-Type: application/json' \
  -d '{
        "from": "+36123456789",
        "body": "How do I reset my password?",
        "messageId": "SM123456789",
        "timestamp": "2026-07-27T12:00:00Z"
      }'
```

You get `204 No Content` immediately. The generated answer appears in the
application log (`[mock] → +36123456789: ...`), because the mock SMS provider
prints instead of sending.

Read it back:

```bash
TOKEN=$(curl -s -X POST localhost:3000/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}' | jq -r .accessToken)

curl -s -H "Authorization: Bearer $TOKEN" \
  'localhost:3000/admin/conversations?phoneNumber=%2B36123456789' | jq
```

Rate the answer — reply `👍`, `1`, `👎` or `0` from the same number:

```bash
curl -X POST localhost:3000/webhook/sms \
  -H 'Content-Type: application/json' \
  -d '{"from":"+36123456789","body":"👍","messageId":"SM123456790"}'
```

Tests:

```bash
npm test          # 37 unit tests, no database, no network
npm run test:e2e  # 15 e2e tests against a real PostgreSQL
```

E2E use a separate database (`sms_llm_chat_test`); create it once with
`docker compose exec postgres createdb -U sms sms_llm_chat_test`.

### Schema

Outside production the schema is created from the entities on boot
(`synchronize`). Production runs migrations instead:

```bash
npm run migration:run                                    # apply
npm run migration:revert                                 # roll the last one back
npm run migration:generate -- src/database/migrations/<Name>   # after an entity change
```

`migration:generate` against an up-to-date database prints "No changes in
database schema were found" — that is the check that the entities and the
migrations still describe the same schema.

---

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/webhook/sms` | Twilio signature (when `SMS_PROVIDER=twilio`) | Incoming SMS, generic JSON format |
| `POST` | `/webhook/sms/twilio` | Twilio signature | Incoming SMS, Twilio form-encoded format |
| `POST` | `/admin/login` | — | Returns a JWT with the `admin` role |
| `GET` | `/admin/conversations?phoneNumber=` | JWT, role `admin` | Conversation history for one number |
| `GET` | `/health` | — | Liveness plus which providers are active |

Both webhook routes answer `204` and never return the generated text — the reply
is sent as a separate outbound SMS. See *Design decisions* for why.

---

## Configuration

Every variable is validated at startup. A misconfigured service refuses to boot
and lists **all** problems at once, instead of failing on live traffic later.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | |
| `DATABASE_URL` | — | Required. |
| `SMS_PROVIDER` | `mock` | `mock` \| `twilio` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | — | Required when `SMS_PROVIDER=twilio`. |
| `TWILIO_WEBHOOK_URL` | — | Required when `SMS_PROVIDER=twilio`. The signature is computed over the exact public URL, so behind a proxy the URL the app sees is not the URL Twilio signed. |
| `LLM_PROVIDER` | `mock` | `mock` \| `openai` |
| `OPENAI_API_KEY` | — | Required when `LLM_PROVIDER=openai`. |
| `LLM_MODEL` | `gpt-4o-mini` | |
| `LLM_TIMEOUT_MS` | `10000` | |
| `SMS_MAX_LENGTH` | `320` | Outbound replies are truncated to this. |
| `ADMIN_USERNAME` | `admin` | |
| `ADMIN_PASSWORD_HASH` | hash of `password` | bcrypt hash, not plaintext. Generate: `npm run hash:password -- 'your-password'` |
| `JWT_SECRET` | — | Required. |
| `JWT_EXPIRES_IN_SECONDS` | `3600` | |

---

## Using real Twilio

1. Create a free trial account and verify your own phone number (trial accounts
   can only message verified numbers, ~100 messages/day).
2. Expose your local server: `ngrok http 3000`.
3. In the Twilio console, set the number's **A MESSAGE COMES IN** webhook to
   `https://<your-ngrok-domain>/webhook/sms/twilio` (HTTP POST).
4. Fill in `.env`:

   ```
   SMS_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_PHONE_NUMBER=+1...
   TWILIO_WEBHOOK_URL=https://<your-ngrok-domain>/webhook/sms/twilio
   ```

5. Restart and text your Twilio number.

`TWILIO_WEBHOOK_URL` must match the console entry character for character, or
signature verification rejects every request.

To use a real model, set `LLM_PROVIDER=openai` and `OPENAI_API_KEY`. The two
switches are independent: real Twilio with a mock model, or a real model with
mock SMS, both work.

---

## Architecture

```
POST /webhook/sms
      │
      ├─ TwilioSignatureGuard        reject anything not signed by Twilio
      ├─ parsers/                    format is chosen by the ROUTE
      ├─ normalizePhoneNumber        E.164, so one caller is one caller
      └─ emit('sms.received') ──────► 204 No Content   (webhook is done here)
                │
                ▼
      IncomingMessageHandler         @OnEvent, runs after the response
                │
                ├─ 1. feedback?      record 👍/👎, no LLM, no reply, stop
                ├─ 2. duplicate?     unique providerMessageId, stop
                ├─ 3. ILlmProvider   generate (mock | OpenAI)
                └─ 4. ISmsProvider   truncate and send (mock | Twilio)
```

Each concern sits behind an interface — `ISmsProvider`, `ILlmProvider`,
`IConversationRepository` — and the choice of implementation lives in exactly one
factory per subsystem. Business logic depends on the interfaces only, which is
what makes providers swappable without touching the flow.

---

## Design decisions

**The webhook acknowledges before the work happens.** Twilio allows 5s to
connect and 15s total, then retries up to 5 times. An LLM call does not reliably
fit in that budget, and waiting for it would mean duplicate SMS to the customer
on every latency spike. So the controller validates, parses, publishes an event
and returns `204`; generation and delivery happen after the response. This is
also why replies go out through the Twilio REST API rather than TwiML — TwiML
would require the answer to be in the webhook response body.

**In-process event bus, not a queue.** `@nestjs/event-emitter` decouples the
controller from the work without adding infrastructure. The controller knows
nothing about the model or the database, so replacing the bus with BullMQ is a
new listener, not a rewrite. The accepted cost: if the process dies between the
acknowledgement and the send, that message is lost. First item under *Future
improvements*.

**Idempotency at the database, not with a lookup.** `providerMessageId` is
unique; the code inserts and catches the violation. Checking "does it exist"
before inserting is a race — two concurrent retries both pass the check.

**Webhook signature verification.** Without it the endpoint is an open door to
anyone who wants to spend your LLM and SMS budget. Uses Twilio's official
`validateRequest`; disabled for the mock provider so local development works.

**Parsing belongs to the route, not the provider.** The payload format is
determined by which URL Twilio posted to, not by who sends replies. Keeping the
parsers separate lets you receive real Twilio webhooks while replying through the
mock (a normal staging setup), and keeps `ISmsProvider` down to one method.

**Feedback is a field, not a table.** The relation is 1:1 with a conversation;
a separate table would add a join and nothing else. A message counts as feedback
only if it consists *entirely* of a marker — otherwise "1 more question please"
would be swallowed as a rating instead of answered.

**A failed generation does not complete a conversation.** The customer still gets
an honest "try again later", but the record stays `FAILED`, so a later 👍 cannot
attach itself to an apology.

**Truncation is a guarantee, the prompt is a request.** The system prompt asks
for short answers; `SMS_MAX_LENGTH` makes sure one verbose reply cannot become
ten billed segments.

**PostgreSQL from the start**, with `synchronize` enabled only outside
production, where migrations take over. The initial migration is generated from
the entities rather than hand-written, and it creates the `uuid-ossp` extension
explicitly: TypeORM will do that implicitly on connect, but only if the database
user may create extensions, and finding that out during a deploy is expensive.

**Shutdown drains what is in flight.** Because the webhook is acknowledged
before the message is processed, at any instant there is work that exists only
in memory. `IncomingMessageHandler` tracks it and `onApplicationShutdown` waits
for it, so an ordinary deploy or scale-down does not drop messages. A hard crash
still does — that is what the durable queue below is for.

---

## Future improvements

Ordered by what I would do next, not by size.

1. **Durable queue (BullMQ/Redis) instead of the in-process bus** — removes the
   one accepted failure mode. A graceful shutdown already covers deploys and
   scale-downs; a hard crash, an OOM kill or a lost pod still loses whatever was
   mid-flight, and only durable storage fixes that. Also brings retries with
   backoff for LLM and SMS calls, which are currently single-attempt.
2. **Conversation memory** — every reply is generated in isolation today. Storing
   and replaying recent turns changes `ILlmProvider` in one place, by design.
3. **Delivery status** — the column exists; the Twilio status callback webhook
   that fills it does not.
4. **Rate limiting per phone number** — nothing currently stops one sender from
   draining the LLM budget.
5. **Real admin accounts** — one configured admin is enough for this scope, but a
   users table with hashed passwords and refresh tokens is the real shape.
6. **Structured logging with a correlation id** carried from webhook to reply, so
   one customer message can be traced across the async boundary.
7. **CI** — the test suites exist and are fast; nothing runs them automatically.
8. **Splitting `Conversation` into `Conversation` + `Message`** once diagram (2)
   lands — the flat model is right for one-shot Q&A and wrong for real threads.

Not done deliberately, not forgotten: multi-channel support, an admin UI, and
retry/backoff (see 1).

---

## Assumptions and trade-offs

- The phone number is the only customer identity; there is no users table.
- One LLM call per inbound message, with no dialogue history.
- Feedback attaches to the most recent **completed** conversation for that
  number, with no time window, and can be overwritten by a later rating.
- Numbers are stored in E.164. Numbers that `libphonenumber-js` cannot validate
  are still normalized to `+` and digits rather than rejected, so an unusual
  number never costs a customer their message.
- The mock LLM answers from a small keyword table. It is deterministic on
  purpose — the flow tests assert on the exact text a customer receives.

---

## Project layout

```
src/
  common/         phone (E.164) and SMS length helpers
  config/         env schema (zod) + typed access, validated at startup
  conversations/  entity, repository interface + TypeORM implementation, service
  database/       TypeORM wiring, CLI data source, migrations
  llm/            ILlmProvider, mock and OpenAI implementations, factory
  messaging/      the flow: event, feedback parser, IncomingMessageHandler
  sms/            ISmsProvider, mock and Twilio implementations, parsers, guard
  admin/          JWT auth, role guard, conversations endpoint
test/             e2e specs and the app harness
docs/             the spec and plan this project was built from
```

`docs/specs/sms-llm-chat.md` and `docs/plans/sms-llm-chat.md` contain the
requirements and the implementation plan, including the constraints that drove
the design above.
