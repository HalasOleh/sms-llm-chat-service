import { IsNotEmpty, IsString } from 'class-validator';

import type { Conversation } from '../../conversations/conversation.entity';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ConversationQueryDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;
}

/**
 * The public representation of a conversation.
 *
 * A separate layer for two reasons: the assignment's example shows the status
 * in lowercase while internally it is an enum; and the entity must not leak
 * out as-is, or every new internal column would automatically become part of
 * the public contract.
 */
export interface ConversationResponse {
  id: string;
  phoneNumber: string;
  incomingMessage: string;
  llmResponse: string | null;
  providerMessageId: string;
  status: string;
  feedback: string;
  createdAt: string;
}

export function toConversationResponse(
  conversation: Conversation,
): ConversationResponse {
  return {
    id: conversation.id,
    phoneNumber: conversation.phoneNumber,
    incomingMessage: conversation.incomingMessage,
    llmResponse: conversation.llmResponse,
    providerMessageId: conversation.providerMessageId,
    status: conversation.status.toLowerCase(),
    feedback: conversation.feedback.toLowerCase(),
    createdAt: conversation.createdAt.toISOString(),
  };
}
