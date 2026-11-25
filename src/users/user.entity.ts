import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../auth/role.enum';

@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
@Check('ck_users_email_lowercase', '"email" = lower("email")')
@Check('ck_users_role', `"role" IN ('admin', 'planner', 'operator')`)
export class User {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  /**
   * select: false -> never loaded by find()/findOneBy() unless a query asks for it
   * explicitly with addSelect. A forgotten response mapping can't leak it.
   */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: Role;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
