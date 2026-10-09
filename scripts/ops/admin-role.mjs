import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const args = new Set(argv);

function valueFor(prefix) {
  const argument = [...args].find((value) => value.startsWith(`${prefix}=`));
  if (argument) return argument.slice(prefix.length + 1).trim();
  const index = argv.indexOf(prefix);
  return index >= 0 ? argv[index + 1]?.trim() : undefined;
}

async function main() {
  const email = valueFor('--email')?.toLowerCase();
  const role = valueFor('--role');
  const execute = args.has('--execute');

  if (!email || !role || !['user', 'admin'].includes(role)) {
    throw new Error('Usage: pnpm admin:role -- --email=user@example.com --role=admin|user [--execute]');
  }

  const credential = await prisma.userCredential.findUnique({
    where: { normalizedEmail: email },
    include: { user: { select: { id: true, role: true, status: true } } },
  });
  if (!credential) throw new Error('The account must already exist.');
  if (credential.user.status !== 'active') throw new Error('The account must be active.');
  if (role === 'admin' && credential.emailVerifiedAt === null) {
    throw new Error('Verify the account email before granting admin access.');
  }

  const result = {
    email: credential.normalizedEmail,
    currentRole: credential.user.role,
    requestedRole: role,
    changed: credential.user.role !== role,
    mode: execute ? 'execute' : 'dry-run',
  };

  if (execute && result.changed) {
    await prisma.user.update({ where: { id: credential.user.id }, data: { role } });
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Admin role operation failed.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
