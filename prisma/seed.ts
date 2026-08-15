import { PrismaClient, Prisma } from '@prisma/client';

import { CONFIG_DEFAULTS, FLAG_DEFAULTS } from '../src/config/config-keys';

const prisma = new PrismaClient();

/**
 * Seeds the config and flag tables so ops has something to edit on day one.
 * Uses upsert-create-only semantics: re-running never overwrites a value ops
 * has since changed.
 */
async function main(): Promise<void> {
  for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
    await prisma.config.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: {},
    });
  }

  for (const [key, enabled] of Object.entries(FLAG_DEFAULTS)) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled },
      update: {},
    });
  }

  console.log(
    `Seeded ${Object.keys(CONFIG_DEFAULTS).length} config keys and ` +
      `${Object.keys(FLAG_DEFAULTS).length} feature flags.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
