import type { AppConfigService } from '../config/app-config.service';
import { Feedback } from '../conversations/conversation.entity';
import type { Conversation } from '../conversations/conversation.entity';
import type { ConversationsService } from '../conversations/conversations.service';
import { LlmGenerationError } from '../llm/llm-provider.interface';
import type { ILlmProvider } from '../llm/llm-provider.interface';
import type { ISmsProvider } from '../sms/sms-provider.interface';
import type { SmsReceivedEvent } from './events/sms-received.event';
import { parseFeedback } from './feedback-parser';
import { IncomingMessageHandler } from './incoming-message.handler';

describe('parseFeedback', () => {
  it('recognises positive markers', () => {
    for (const body of ['👍', '1', '+', 'y', 'YES', '  1  ']) {
      expect(parseFeedback(body)).toBe(Feedback.Positive);
    }
  });

  it('recognises negative markers', () => {
    for (const body of ['👎', '0', '-', 'n', 'No']) {
      expect(parseFeedback(body)).toBe(Feedback.Negative);
    }
  });

  it('does not mistake a real question containing a marker for a rating', () => {
    // The most important case: otherwise the customer's question is
    // silently swallowed.
    expect(parseFeedback('1 more question please')).toBeNull();
    expect(parseFeedback('no idea how to reset my password')).toBeNull();
    expect(parseFeedback('yes, but how do I cancel?')).toBeNull();
  });

  it('treats an empty message as not a rating', () => {
    expect(parseFeedback('   ')).toBeNull();
  });
});

describe('IncomingMessageHandler', () => {
  const event: SmsReceivedEvent = {
    phoneNumber: '+36123456789',
    body: 'How do I reset my password?',
    providerMessageId: 'SM123456789',
    providerTimestamp: new Date('2026-07-27T12:00:00Z'),
  };

  const conversation = { id: 'conv_1' } as Conversation;

  let conversations: jest.Mocked<
    Pick<
      ConversationsService,
      | 'startConversation'
      | 'attachLlmResponse'
      | 'markCompleted'
      | 'markFailed'
      | 'recordFeedback'
    >
  >;
  let sms: jest.Mocked<ISmsProvider>;
  let llm: jest.Mocked<ILlmProvider>;
  let handler: IncomingMessageHandler;

  beforeEach(() => {
    conversations = {
      startConversation: jest.fn().mockResolvedValue(conversation),
      attachLlmResponse: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      recordFeedback: jest.fn().mockResolvedValue(true),
    };

    sms = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    llm = { generateReply: jest.fn().mockResolvedValue('Reset it here.') };

    handler = new IncomingMessageHandler(
      conversations as unknown as ConversationsService,
      { smsMaxLength: 320 } as AppConfigService,
      sms,
      llm,
    );
  });

  it('takes an ordinary message through the whole flow', async () => {
    await handler.handle(event);

    expect(conversations.startConversation).toHaveBeenCalledWith({
      phoneNumber: event.phoneNumber,
      incomingMessage: event.body,
      providerMessageId: event.providerMessageId,
      providerTimestamp: event.providerTimestamp,
    });
    expect(llm.generateReply).toHaveBeenCalledWith(event.body);
    expect(conversations.attachLlmResponse).toHaveBeenCalledWith(
      'conv_1',
      'Reset it here.',
    );
    expect(sms.sendMessage).toHaveBeenCalledWith(
      event.phoneNumber,
      'Reset it here.',
    );
    expect(conversations.markCompleted).toHaveBeenCalledWith('conv_1');
  });

  it('calls neither the model nor delivery on a repeat delivery', async () => {
    conversations.startConversation.mockResolvedValue(null);

    await handler.handle(event);

    expect(llm.generateReply).not.toHaveBeenCalled();
    expect(sms.sendMessage).not.toHaveBeenCalled();
  });

  it('still answers the customer and records the error when the model fails', async () => {
    llm.generateReply.mockRejectedValue(
      new LlmGenerationError('upstream is down'),
    );

    await handler.handle(event);

    expect(sms.sendMessage).toHaveBeenCalledWith(
      event.phoneNumber,
      expect.stringContaining('could not process'),
    );
    expect(conversations.markFailed).toHaveBeenCalledWith(
      'conv_1',
      'upstream is down',
    );
    // A conversation holding an apology is not completed — otherwise a later
    // 👍 would attach itself to it.
    expect(conversations.markCompleted).not.toHaveBeenCalled();
  });

  it('records the error and stays up when delivery fails', async () => {
    sms.sendMessage.mockRejectedValue(new Error('twilio 500'));

    await expect(handler.handle(event)).resolves.toBeUndefined();

    expect(conversations.markFailed).toHaveBeenCalledWith(
      'conv_1',
      'twilio 500',
    );
    expect(conversations.markCompleted).not.toHaveBeenCalled();
  });

  it('truncates an over-long model answer before sending', async () => {
    llm.generateReply.mockResolvedValue('word '.repeat(200));

    handler = new IncomingMessageHandler(
      conversations as unknown as ConversationsService,
      { smsMaxLength: 40 } as AppConfigService,
      sms,
      llm,
    );

    await handler.handle(event);

    const [, sentBody] = sms.sendMessage.mock.calls[0];
    expect(sentBody.length).toBeLessThanOrEqual(40);
  });

  it('records a rating without calling the model or replying', async () => {
    await handler.handle({ ...event, body: '👍' });

    expect(conversations.recordFeedback).toHaveBeenCalledWith(
      event.phoneNumber,
      Feedback.Positive,
    );
    expect(conversations.startConversation).not.toHaveBeenCalled();
    expect(llm.generateReply).not.toHaveBeenCalled();
    // Replying to a rating is not allowed: the customer and the service would
    // acknowledge each other's acknowledgements forever.
    expect(sms.sendMessage).not.toHaveBeenCalled();
  });

  it('survives a rating with no previous conversation', async () => {
    conversations.recordFeedback.mockResolvedValue(false);

    await expect(
      handler.handle({ ...event, body: '👎' }),
    ).resolves.toBeUndefined();
  });

  it('does not let a storage error escape', async () => {
    // The handler runs after the webhook response: an error escaping here is
    // an unhandled rejection and a dead process.
    conversations.startConversation.mockRejectedValue(new Error('db is down'));

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });

  it('finishes a message already in progress before shutting down', async () => {
    // The webhook was acknowledged, so this message exists nowhere but in
    // memory. A deploy at this instant must not drop it.
    let releaseModel!: (reply: string) => void;
    llm.generateReply.mockReturnValue(
      new Promise<string>((resolve) => {
        releaseModel = resolve;
      }),
    );

    const processing = handler.handle(event);
    await Promise.resolve();
    expect(sms.sendMessage).not.toHaveBeenCalled();

    const draining = handler.onApplicationShutdown();
    releaseModel('Reset it here.');
    await draining;

    expect(sms.sendMessage).toHaveBeenCalledWith(
      event.phoneNumber,
      'Reset it here.',
    );
    expect(conversations.markCompleted).toHaveBeenCalledWith('conv_1');
    await processing;
  });

  it('shuts down immediately when nothing is in progress', async () => {
    await expect(handler.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
