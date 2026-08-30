import 'dotenv/config';
import { DataSource } from 'typeorm';

import { Conversation } from '../conversations/conversation.entity';

/**
 * A DataSource used only by the TypeORM CLI (generating and running
 * migrations). The application itself never imports this: it builds its
 * connection through DatabaseModule, from validated configuration.
 *
 * The duplication is deliberate and unavoidable — the CLI runs outside the
 * Nest container, so it cannot ask AppConfigService for anything. Keeping it
 * to this one file means the entity list is the only thing that has to stay
 * in step, and a mismatch surfaces immediately as a generated migration that
 * should have been empty.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Conversation],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});
