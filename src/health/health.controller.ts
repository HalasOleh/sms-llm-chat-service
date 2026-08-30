import { Controller, Get } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';

@Controller('health')
export class HealthController {
  constructor(private readonly config: AppConfigService) {}

  /**
   * Reports which provider implementations actually came up — during
   * troubleshooting that is the first question ("is it really sending
   * through Twilio?").
   */
  @Get()
  check(): {
    status: 'ok';
    smsProvider: string;
    llmProvider: string;
  } {
    return {
      status: 'ok',
      smsProvider: this.config.smsProvider,
      llmProvider: this.config.llmProvider,
    };
  }
}
