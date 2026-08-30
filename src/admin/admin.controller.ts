import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { normalizePhoneNumber } from '../common/phone.util';
import { ConversationsService } from '../conversations/conversations.service';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard, Roles, RolesGuard } from './auth/guards';
import {
  ConversationQueryDto,
  LoginDto,
  toConversationResponse,
  type ConversationResponse,
} from './dto/admin.dto';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly conversations: ConversationsService,
  ) {}

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<{ accessToken: string }> {
    return { accessToken: await this.auth.login(dto.username, dto.password) };
  }

  /**
   * Conversation history for one customer.
   *
   * The number is normalized by the same code as on the webhook path —
   * otherwise an admin who typed the number without a "+" would get an empty
   * list and conclude there are no conversations.
   */
  @Get('conversations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async findConversations(
    @Query() query: ConversationQueryDto,
  ): Promise<{ phoneNumber: string; conversations: ConversationResponse[] }> {
    const phoneNumber = normalizePhoneNumber(query.phoneNumber);
    const conversations = await this.conversations.findByPhone(phoneNumber);

    return {
      phoneNumber,
      conversations: conversations.map(toConversationResponse),
    };
  }
}
