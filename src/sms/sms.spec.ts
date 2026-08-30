import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { getExpectedTwilioSignature } from 'twilio/lib/webhooks/webhooks';

import { normalizePhoneNumber } from '../common/phone.util';
import { truncateForSms } from '../common/text.util';
import type { AppConfigService } from '../config/app-config.service';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';
import { MockSmsProvider } from './providers/mock-sms.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';

describe('normalizePhoneNumber', () => {
  it('collapses different spellings of one number into a single value', () => {
    const expected = '+36123456789';

    expect(normalizePhoneNumber('+36123456789')).toBe(expected);
    expect(normalizePhoneNumber('36123456789')).toBe(expected);
    expect(normalizePhoneNumber('+36 12 345 6789')).toBe(expected);
    expect(normalizePhoneNumber('  +36123456789  ')).toBe(expected);
  });

  it('produces canonical E.164 for a number the library recognises', () => {
    expect(normalizePhoneNumber('+380 44 123 4567')).toBe('+380441234567');
    expect(normalizePhoneNumber('380441234567')).toBe('+380441234567');
  });

  it('does not lose the message when the number is unparseable', () => {
    expect(normalizePhoneNumber('not-a-number')).toBe('not-a-number');
  });
});

describe('truncateForSms', () => {
  it('leaves text within the limit untouched', () => {
    expect(truncateForSms('Short answer.', 100)).toBe('Short answer.');
  });

  it('truncates an over-long model answer', () => {
    const long = 'word '.repeat(200);
    const result = truncateForSms(long, 50);

    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith('…')).toBe(true);
  });

  it('cuts on a word boundary rather than mid-word', () => {
    const result = truncateForSms('alpha beta gamma delta', 16);

    expect(result).toBe('alpha beta…');
  });
});

describe('MockSmsProvider', () => {
  let provider: MockSmsProvider;

  beforeEach(() => {
    provider = new MockSmsProvider();
  });

  it('parses the generic JSON format from the assignment', () => {
    const parsed = provider.parseIncoming({
      from: '+36123456789',
      body: 'How do I reset my password?',
      messageId: 'SM123456789',
      timestamp: '2026-07-27T12:00:00Z',
    });

    expect(parsed).toEqual({
      from: '+36123456789',
      body: 'How do I reset my password?',
      messageId: 'SM123456789',
      timestamp: new Date('2026-07-27T12:00:00Z'),
    });
  });

  it('rejects a payload missing required fields', () => {
    expect(() => provider.parseIncoming({ from: '+36123456789' })).toThrow(
      BadRequestException,
    );
  });

  it('leaves the timestamp empty when the provider did not send one', () => {
    const parsed = provider.parseIncoming({
      from: '+36123456789',
      body: 'hi',
      messageId: 'SM1',
    });

    expect(parsed.timestamp).toBeNull();
  });

  it('remembers what it sent so tests can assert on it', async () => {
    await provider.sendMessage('+36123456789', 'Answer one');
    await provider.sendMessage('+36123456789', 'Answer two');

    expect(provider.getSentMessages()).toHaveLength(2);
    expect(provider.getLastMessageTo('+36123456789')?.body).toBe('Answer two');
  });
});

describe('TwilioSmsProvider.parseIncoming', () => {
  const config = {
    twilio: {
      accountSid: 'AC00000000000000000000000000000000',
      authToken: 'test-token',
      phoneNumber: '+15550001111',
      webhookUrl: 'https://example.test/webhook/sms/twilio',
    },
  } as AppConfigService;

  const provider = new TwilioSmsProvider(config);

  it("parses Twilio's standard form-encoded format", () => {
    const parsed = provider.parseIncoming({
      From: '+36123456789',
      Body: 'How do I reset my password?',
      MessageSid: 'SM123456789',
      DateSent: 'Mon, 27 Jul 2026 12:00:00 +0000',
    });

    expect(parsed.from).toBe('+36123456789');
    expect(parsed.messageId).toBe('SM123456789');
    expect(parsed.timestamp).toEqual(new Date('2026-07-27T12:00:00Z'));
  });

  it('accepts a message with an empty body', () => {
    const parsed = provider.parseIncoming({
      From: '+36123456789',
      MessageSid: 'SM1',
    });

    expect(parsed.body).toBe('');
  });

  it('rejects a payload without MessageSid', () => {
    expect(() => provider.parseIncoming({ From: '+36123456789' })).toThrow(
      BadRequestException,
    );
  });
});

describe('TwilioSignatureGuard', () => {
  const authToken = 'test-auth-token';
  const webhookUrl = 'https://example.test/webhook/sms/twilio';

  const contextWith = (
    body: Record<string, string>,
    signature?: string,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          body,
          header: (name: string) =>
            name === 'X-Twilio-Signature' ? signature : undefined,
        }),
      }),
    }) as unknown as ExecutionContext;

  const guardFor = (smsProvider: 'mock' | 'twilio'): TwilioSignatureGuard =>
    new TwilioSignatureGuard({
      smsProvider,
      twilio: { authToken, webhookUrl, accountSid: 'AC', phoneNumber: '+1' },
    } as AppConfigService);

  it('lets everything through on the mock, or local development breaks', () => {
    expect(guardFor('mock').canActivate(contextWith({ Body: 'hi' }))).toBe(
      true,
    );
  });

  it('accepts a request with a valid Twilio signature', () => {
    const body = { Body: 'hello', From: '+36123456789', MessageSid: 'SM1' };
    // Signed with the very algorithm the guard verifies against.
    const signature = getExpectedTwilioSignature(authToken, webhookUrl, body);

    expect(guardFor('twilio').canActivate(contextWith(body, signature))).toBe(
      true,
    );
  });

  it('rejects a request with a forged signature', () => {
    const body = { Body: 'hello', From: '+36123456789', MessageSid: 'SM1' };

    expect(() =>
      guardFor('twilio').canActivate(contextWith(body, 'forged-signature')),
    ).toThrow(ForbiddenException);
  });

  it('rejects a request with no signature at all', () => {
    expect(() =>
      guardFor('twilio').canActivate(contextWith({ Body: 'hello' })),
    ).toThrow(ForbiddenException);
  });
});
