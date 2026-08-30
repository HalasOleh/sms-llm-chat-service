import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The conversations table, generated from the entity.
 *
 * Outside production the schema comes from `synchronize`; here it comes from
 * this file. Both must describe the same shape, and `migration:generate`
 * against an up-to-date database is what proves it — a non-empty diff means
 * the entity moved and this migration did not.
 */
export class InitialSchema1788098481875 implements MigrationInterface {
  name = 'InitialSchema1788098481875';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The uuid primary key defaults to uuid_generate_v4(), which lives in an
    // extension rather than in core Postgres. TypeORM creates it implicitly on
    // connect, but that needs rights a production database user often does not
    // have, and an implicit dependency is a bad thing to discover during a
    // deploy. Stated explicitly, and idempotent.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TYPE "public"."conversations_status_enum" AS ENUM('RECEIVED', 'RESPONSE_GENERATED', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."conversations_feedback_enum" AS ENUM('POSITIVE', 'NEGATIVE', 'NONE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "conversations" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"phoneNumber" character varying(32) NOT NULL, ` +
        `"incomingMessage" text NOT NULL, ` +
        `"llmResponse" text, ` +
        `"providerMessageId" character varying(128) NOT NULL, ` +
        `"providerTimestamp" TIMESTAMP WITH TIME ZONE, ` +
        `"status" "public"."conversations_status_enum" NOT NULL DEFAULT 'RECEIVED', ` +
        `"feedback" "public"."conversations_feedback_enum" NOT NULL DEFAULT 'NONE', ` +
        `"deliveryStatus" character varying(32), ` +
        `"errorMessage" text, ` +
        `"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "UQ_edaef643ea0ea75a8c43fa00f99" UNIQUE ("providerMessageId"), ` +
        `CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id")` +
        `)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f3ad91fe09f8f1213ac799bf5e" ON "conversations" ("phoneNumber", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f3ad91fe09f8f1213ac799bf5e"`,
    );
    await queryRunner.query(`DROP TABLE "conversations"`);
    await queryRunner.query(`DROP TYPE "public"."conversations_feedback_enum"`);
    await queryRunner.query(`DROP TYPE "public"."conversations_status_enum"`);
  }
}
