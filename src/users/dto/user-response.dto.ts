import { Role } from '../../auth/role.enum';
import { User } from '../user.entity';

/** Public shape of a user. Never contains the password hash. */
export class UserResponseDto {
  id!: number;
  email!: string;
  role!: Role;
  createdAt!: Date;

  static from(user: User): UserResponseDto {
    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
  }
}
