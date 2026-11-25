import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { PasswordHasher } from './password-hasher';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly hasher: PasswordHasher,
  ) {}

  /** Duplicate emails are rejected by uq_users_email -> 409 via PgErrorFilter. */
  async create(dto: CreateUserDto): Promise<User> {
    const passwordHash = await this.hasher.hash(dto.password);
    return this.repo.save(this.repo.create({ email: dto.email, role: dto.role, passwordHash }));
  }

  async findById(id: number): Promise<User> {
    const user = await this.repo.findOneBy({ id });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  /** The only query that loads password_hash (it is select:false on the entity). */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }
}
