import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { parseArgs } from 'node:util';
import dataSource from '../database/data-source';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { PasswordHasher } from '../users/password-hasher';
import { User } from '../users/user.entity';

/**
 * Bootstrap script: solves the chicken-and-egg problem that POST /users itself
 * requires an admin token, so the first admin has to be created here.
 *
 *   NEW_USER_PASSWORD=... node dist/scripts/create-user.js --email a@b.c --role admin
 *
 * The password comes from an env var, not a CLI flag, so it doesn't end up in
 * shell history or in the process list (`ps`).
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, role: { type: 'string' } },
  });

  const dto = plainToInstance(CreateUserDto, {
    email: values.email,
    role: values.role,
    password: process.env.NEW_USER_PASSWORD,
  });
  const errors = await validate(dto);
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new Error(`Invalid input (password comes from NEW_USER_PASSWORD):\n  - ${messages.join('\n  - ')}`);
  }

  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(User);
    const passwordHash = await new PasswordHasher().hash(dto.password);
    const user = await repo.save(repo.create({ email: dto.email, role: dto.role, passwordHash }));
    console.log(`Created user id=${user.id} email=${user.email} role=${user.role}`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
