import request from 'supertest';

import {
  Conversation,
  ConversationStatus,
  Feedback,
} from '../src/conversations/conversation.entity';
import { createHarness, type Harness } from './app-harness';

describe('Main SMS flow (e2e)', () => {
  const PHONE = '+36123456789';
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const findByProviderId = (
    providerMessageId: string,
  ): Promise<Conversation | null> =>
    harness.dataSource
      .getRepository(Conversation)
      .findOne({ where: { providerMessageId } });

  it('carries an incoming message all the way to a reply', async () => {
    await request(harness.server)
      .post('/webhook/sms')
      .send({
        from: PHONE,
        body: 'How do I reset my password?',
        messageId: 'SM_e2e_1',
        timestamp: '2026-07-27T12:00:00Z',
      })
      .expect(204);

    await harness.waitForProcessing();

    const stored = await findByProviderId('SM_e2e_1');

    expect(stored).not.toBeNull();
    expect(stored?.phoneNumber).toBe(PHONE);
    expect(stored?.incomingMessage).toBe('How do I reset my password?');
    expect(stored?.llmResponse).toContain('Forgot password');
    expect(stored?.status).toBe(ConversationStatus.Completed);
    expect(stored?.providerTimestamp).toEqual(new Date('2026-07-27T12:00:00Z'));

    // The customer really received exactly what was stored.
    expect(harness.sms.getLastMessageTo(PHONE)?.body).toBe(stored?.llmResponse);
  });

  it('acknowledges the webhook without waiting for processing', async () => {
    const startedAt = Date.now();

    await request(harness.server)
      .post('/webhook/sms')
      .send({ from: PHONE, body: 'hello', messageId: 'SM_e2e_fast' })
      .expect(204);

    // The core property of the design: the response to the provider does not
    // depend on how slow the model is. Twilio allows 15 seconds in total.
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('accepts the Twilio format on its own route', async () => {
    await request(harness.server)
      .post('/webhook/sms/twilio')
      .type('form')
      .send({ From: PHONE, Body: 'I need a refund', MessageSid: 'SM_e2e_tw' })
      .expect(204);

    await harness.waitForProcessing();

    const stored = await findByProviderId('SM_e2e_tw');

    expect(stored?.llmResponse).toContain('Refunds');
  });

  it('does not create a second conversation or a second SMS on a retry', async () => {
    const payload = {
      from: PHONE,
      body: 'How do I reset my password?',
      messageId: 'SM_e2e_dup',
    };

    // Twilio retries a webhook up to 5 times — an ordinary situation, not a
    // failure.
    await request(harness.server)
      .post('/webhook/sms')
      .send(payload)
      .expect(204);
    await harness.waitForProcessing();

    await request(harness.server)
      .post('/webhook/sms')
      .send(payload)
      .expect(204);
    await harness.waitForProcessing();

    const count = await harness.dataSource
      .getRepository(Conversation)
      .count({ where: { providerMessageId: 'SM_e2e_dup' } });

    expect(count).toBe(1);
    expect(harness.sms.getSentMessages()).toHaveLength(1);
  });

  it('rejects an unparseable payload with 400', async () => {
    await request(harness.server)
      .post('/webhook/sms')
      .send({ from: PHONE })
      .expect(400);
  });
});

describe('Feedback (e2e)', () => {
  const PHONE = '+36123456789';
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const sendSms = async (body: string, messageId: string): Promise<void> => {
    await request(harness.server)
      .post('/webhook/sms')
      .send({ from: PHONE, body, messageId })
      .expect(204);
    await harness.waitForProcessing();
  };

  it('attaches 👍 to the latest completed conversation', async () => {
    await sendSms('How do I reset my password?', 'SM_fb_1');
    await sendSms('👍', 'SM_fb_2');

    const conversations = await harness.dataSource
      .getRepository(Conversation)
      .find();

    // A rating does not create a conversation of its own.
    expect(conversations).toHaveLength(1);
    expect(conversations[0].feedback).toBe(Feedback.Positive);
    // And triggers no reply — otherwise the exchange would never end.
    expect(harness.sms.getSentMessages()).toHaveLength(1);
  });

  it('treats 👎 and "0" alike as a negative rating', async () => {
    await sendSms('How do I reset my password?', 'SM_fb_3');
    await sendSms('0', 'SM_fb_4');

    const [conversation] = await harness.dataSource
      .getRepository(Conversation)
      .find();

    expect(conversation.feedback).toBe(Feedback.Negative);
  });

  it('breaks nothing when a rating has no previous conversation', async () => {
    await sendSms('👍', 'SM_fb_orphan');

    const conversations = await harness.dataSource
      .getRepository(Conversation)
      .find();

    expect(conversations).toHaveLength(0);
    expect(harness.sms.getSentMessages()).toHaveLength(0);
  });

  it('keeps a question containing a marker a question', async () => {
    await sendSms('How do I reset my password?', 'SM_fb_5');
    await sendSms('1 more question about refunds', 'SM_fb_6');

    const conversations = await harness.dataSource
      .getRepository(Conversation)
      .find({ order: { createdAt: 'ASC' } });

    // The second message had to become a new conversation, not a rating.
    expect(conversations).toHaveLength(2);
    expect(conversations[0].feedback).toBe(Feedback.None);
    expect(conversations[1].llmResponse).toContain('Refunds');
  });
});
