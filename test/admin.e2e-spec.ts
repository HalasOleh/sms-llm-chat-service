import { sign } from 'jsonwebtoken';
import request from 'supertest';

import { createHarness, type Harness } from './app-harness';

describe('Admin access (e2e)', () => {
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

  const login = async (): Promise<string> => {
    const response = await request(harness.server)
      .post('/admin/login')
      .send({ username: 'admin', password: 'password' })
      .expect(201);

    return (response.body as { accessToken: string }).accessToken;
  };

  it('rejects a request with no token', async () => {
    await request(harness.server)
      .get('/admin/conversations')
      .query({ phoneNumber: PHONE })
      .expect(401);
  });

  it('rejects invalid credentials', async () => {
    await request(harness.server)
      .post('/admin/login')
      .send({ username: 'admin', password: 'wrong' })
      .expect(401);
  });

  it('rejects a forged token', async () => {
    await request(harness.server)
      .get('/admin/conversations')
      .query({ phoneNumber: PHONE })
      .set('Authorization', 'Bearer forged.token.value')
      .expect(401);
  });

  it('rejects a valid token carrying the wrong role', async () => {
    // Signed with the same secret, so authentication succeeds — it must trip
    // on the role check specifically.
    const token = sign(
      { sub: 'support', role: 'support' },
      process.env.JWT_SECRET as string,
      { expiresIn: 3600 },
    );

    await request(harness.server)
      .get('/admin/conversations')
      .query({ phoneNumber: PHONE })
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns history with replies, rating and timestamps', async () => {
    await request(harness.server)
      .post('/webhook/sms')
      .send({
        from: PHONE,
        body: 'How do I reset my password?',
        messageId: 'SM_admin_e2e',
      })
      .expect(204);
    await harness.waitForProcessing();

    await request(harness.server)
      .post('/webhook/sms')
      .send({ from: PHONE, body: '👍', messageId: 'SM_admin_e2e_fb' })
      .expect(204);
    await harness.waitForProcessing();

    const response = await request(harness.server)
      .get('/admin/conversations')
      .query({ phoneNumber: PHONE })
      .set('Authorization', `Bearer ${await login()}`)
      .expect(200);

    const body = response.body as {
      phoneNumber: string;
      conversations: Array<Record<string, unknown>>;
    };

    expect(body.conversations).toHaveLength(1);

    const [conversation] = body.conversations;
    expect(conversation.incomingMessage).toBe('How do I reset my password?');
    expect(conversation.llmResponse).toContain('Forgot password');
    // Status and rating in lowercase, as in the assignment's example.
    expect(conversation.status).toBe('completed');
    expect(conversation.feedback).toBe('positive');
    expect(typeof conversation.createdAt).toBe('string');
  });

  it('finds conversations by a differently written number', async () => {
    await request(harness.server)
      .post('/webhook/sms')
      .send({ from: PHONE, body: 'hello', messageId: 'SM_admin_norm' })
      .expect(204);
    await harness.waitForProcessing();

    // The admin typed the number without a "+" — same customer.
    const response = await request(harness.server)
      .get('/admin/conversations')
      .query({ phoneNumber: '36123456789' })
      .set('Authorization', `Bearer ${await login()}`)
      .expect(200);

    const body = response.body as {
      phoneNumber: string;
      conversations: unknown[];
    };

    expect(body.phoneNumber).toBe(PHONE);
    expect(body.conversations).toHaveLength(1);
  });
});
