# Spec: SMS assistant with LLM-generated replies

> Version 2. Revised after a review against Twilio's actual behaviour
> (timeouts, retries, request signing). Changelog at the end of the document.

## Context

The company wants to answer customer SMS enquiries automatically. A customer
texts a question (for example, "how do I reset my password?"), the system
recognises the message, generates an answer with a language model and sends it
back over the same channel (SMS). The whole exchange is stored so that an
administrator can later review the history for a given phone number and see
whether the answer was useful to the customer.

This is a take-home exercise with a four-hour budget, so the goal is to show a
clean, extensible architecture for the core flow — not a full production
service. Everything deliberately left out is recorded under "Out of scope" and
carried into the README as future improvements.

## Task

A user sends an SMS to a designated number. The system must:

1. Accept the incoming message together with the sender's number, the
   provider's message identifier and a timestamp.
2. Store the incoming message.
3. Generate an answer using a language model.
4. Store the generated answer.
5. Send the answer back to the customer over the same channel (SMS).
6. If the customer replies to the advice with an SMS marked "useful"
   (👍 / "1") or "not useful" (👎 / "0"), record that rating against the most
   recent conversation for that number — without generating a new LLM reply to
   the rating itself.
7. An administrator (an authorised user with the admin role) can retrieve the
   full exchange history for a phone number: incoming messages, generated
   answers, timestamps and the usefulness rating.

The SMS provider and the LLM provider must be easy to replace later (moving
from Twilio to Vonage, say, or from OpenAI to Anthropic) without touching the
core business logic.

## Constraints imposed by the channel

These are not implementation details but properties of the environment the
system runs in, and they shape the acceptance criteria below.

- **The provider waits seconds, not minutes, for an acknowledgement.** Twilio
  allows 5s to establish a connection and 15s for the whole response by
  default, after which it treats delivery as failed. A language-model call is
  not guaranteed to fit in that budget.
- **The provider retries delivery.** A failed or too-slow webhook is retried
  (up to 5 times). The same customer message can reach the system several
  times.
- **The webhook is a public endpoint.** Anyone on the internet can post to it;
  without authenticity checks that is a direct route to spending someone
  else's LLM and SMS budget.
- **An outbound SMS costs money and has a length limit.** A long answer is
  split into several billed segments.

## Acceptance criteria

### Core flow

- An incoming SMS (real, through the Twilio webhook, or through the mock
  provider) creates a new conversation record in the database with a status
  reflecting the processing stage (received → response generated → response
  sent, or a failure at any of those steps).
- The customer receives an LLM-generated SMS reply to their original message.
- **The system acknowledges the message to the provider immediately — without
  waiting for the language model.** The acknowledgement fits in a few hundred
  milliseconds regardless of how long the model thinks; generating and sending
  the reply happen after the acknowledgement.
- **A repeat delivery of the same message by the provider creates no second
  database record, no second model call and no second SMS to the customer.**
  The provider's message identifier is the idempotency key; a repeated request
  gets the same successful acknowledgement as the first.
- **A request without a valid provider signature is rejected** (for the real
  provider). For the mock provider the check is disabled — otherwise local
  development is impossible.

### Data

- The phone number is stored normalized (E.164), so that finding the most
  recent conversation and the admin lookup do not depend on how the provider
  or the administrator happened to write it (`+36123456789` and `36123456789`
  are the same customer).
- The provider's timestamp is stored separately from the row's creation time;
  if the provider did not send one, the field stays empty.
- The outbound message is truncated to a length that is safe for a single SMS
  before sending; the customer never receives an answer split across a dozen
  segments, even if the model ignored the instruction to be brief.

### Usefulness rating

- A customer reply of "👍"/"1" or "👎"/"0" is recorded as a rating
  (`positive` / `negative`) against the most recent **completed** conversation
  for that phone number.
- The system makes no model call and sends no SMS in response to a rating
  message (so as not to trigger an endless exchange of acknowledgements).
- A later rating overwrites the earlier one for the same conversation.
- If there is no previous completed conversation for that number, the system
  does not fall over: the event is logged and no conversation is created.

### Admin

- `GET /admin/conversations?phoneNumber=...` returns the conversation history
  for the given number to an authorised administrator only; an unauthorised
  request gets 401, an authorised one without the admin role gets 403.
- The number in the administrator's request is normalized the same way as on
  storage.

### Reliability and startup

- A failure of an external provider (SMS or LLM) or of the database does not
  crash the process unhandled — the conversation stays in the database with a
  recorded error status, the customer (where appropriate) receives an
  understandable message about temporary unavailability, and the error is
  logged.
- **With no external provider keys** in `.env` the system runs entirely on
  mock SMS and LLM out of the box. Variables belonging to our own
  infrastructure (`DATABASE_URL`, `JWT_SECRET`, the administrator's
  credentials) remain mandatory — their absence stops the application at
  startup with an explicit message, rather than later during a request.
- With real keys in `.env` the system uses the real SMS provider (Twilio) and
  the real LLM provider (OpenAI) with no code changes.
- There are automated tests for the core flow (incoming message → stored
  conversation → reply sent), for idempotency of a repeat delivery, and for
  the usefulness-rating flow.
- The README lets anyone bring the project up locally in 5-10 minutes and test
  the webhook without a real Twilio account.

## Key entities

**Conversation** — one "incoming message → generated reply" pair for a
specific phone number: the phone number, the incoming message text, the reply
text, the SMS provider's message identifier, the processing status, the
usefulness rating (positive/negative/none), the arrival time according to the
provider, and the record's creation time.

**SMS provider** — the source of incoming messages and the channel for sending
replies. A replaceable dependency: a mock source for development and tests, a
real one (Twilio) for the production scenario.

**LLM provider** — generates the reply text from the incoming message.
Likewise a replaceable dependency: a mock implementation with predictable
answers for tests, a real one (OpenAI) for the production scenario.

**Administrator** — an authorised operator who reviews the exchange history
with customers but takes no part in the message-processing flow.

## Explicitly out of scope

- Multi-channel support (email, website chat and so on) — SMS only.
- Dialogue context for the LLM (each reply is generated independently, with no
  history of previous messages in the prompt) — noted as a possible
  improvement.
- **An external queue / message broker.** Processing after the
  acknowledgement happens in the same process. The consequence is accepted
  deliberately: if the process dies between the acknowledgement and the send,
  the message is lost. In production a durable queue belongs here — it is the
  first item under future improvements.
- **Delivery status of the outbound SMS** (the provider's delivery status
  callback). Marked optional in the original assignment; the field is present
  in the model, but the status webhook is not implemented.
- Rate limiting, protection against spam and abuse.
- A full role model and administrator management (registering new admins,
  password resets and so on) — a single configured admin account is enough.
- An administrator UI — the API endpoint only.
- Retry logic with backoff for external providers — recorded as a purposeful
  gap; the code keeps a single clear error-handling layer where retries can be
  added later.
- CI/CD and deployment infrastructure. (A local `docker compose` for bringing
  up PostgreSQL is a development tool, not deployment; it is in scope.)

## Assumptions

- "LLM-backed agent" means one model call per incoming message (with no
  dialogue memory).
- The rating format (👍/1, 👎/0) is determined purely by the SMS body, with no
  additional commands. A message counts as a rating only if its body, once
  trimmed, equals one of the recognised markers — a "1" inside a sentence is
  not a rating.
- The phone number is the only customer identifier (no separate users table at
  this stage).
- The database is PostgreSQL (production-compatible from day one, with no
  interim SQLite variant).
- The public representation of the status in the API is lowercase
  (`received`, `completed`, ...), matching the example in the assignment; the
  internal representation in the database is an enum.

## Decisions on previously open questions

1. **The usefulness rating** — a field on the conversation record, not a
   separate entity. The relation is 1:1; a separate table would add a join and
   nothing else.
2. **TwiML vs the REST API** — the reply is sent through the Twilio REST API.
   The webhook responds with an empty acknowledgement; this is the only way to
   satisfy "acknowledge immediately, generate the answer afterwards", and it
   gives the mock and the real provider an identical sending contract.
3. **The LLM provider** — OpenAI.

## Changelog

**v2** — following a review against Twilio's documentation:
- added the section "Constraints imposed by the channel";
- separated the acknowledgement to the provider from generating the reply
  (the spec previously required synchronous processing inside the HTTP
  request, which conflicts with Twilio's 15-second timeout);
- added idempotency keyed on the provider's message identifier;
- added webhook signature verification;
- defined the edge cases of the usefulness rating (overwrite, no previous
  conversation, no reply to a rating);
- added E.164 number normalization, storage of the provider's timestamp, and
  truncation of the outbound SMS;
- clarified the "works without keys" criterion (it concerns external providers
  only);
- moved delivery status and the external queue into explicit out of scope;
- closed all three open questions.
