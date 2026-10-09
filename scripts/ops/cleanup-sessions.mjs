import { PrismaClient } from '@prisma/client';

const execute = process.argv.includes('--execute');
const retentionArgument = process.argv.find((value) => value.startsWith('--retention-days='));
const retentionDays = Number(retentionArgument?.split('=', 2)[1] ?? process.env.SESSION_RETENTION_DAYS ?? 30);

if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  throw new Error('Retention must be an integer from 1 to 3650 days.');
}

const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
const prisma = new PrismaClient();
const where = {
  OR: [
    { expiresAt: { lt: cutoff } },
    { revokedAt: { not: null, lt: cutoff } },
  ],
};

try {
  const count = await prisma.authSession.count({ where });
  if (!execute) {
    console.log(`Dry run: ${count} expired/revoked sessions older than ${cutoff.toISOString()}.`);
    console.log('Re-run with --execute to delete exactly these eligible rows.');
  } else {
    const result = await prisma.authSession.deleteMany({ where });
    console.log(`Deleted ${result.count} expired/revoked sessions older than ${cutoff.toISOString()}.`);
  }
} finally {
  await prisma.$disconnect();
}
