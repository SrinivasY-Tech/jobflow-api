import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnvConfig } from '../config/env.validation';
import { PasswordHasher } from '../users/password-hasher';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './auth-user';
import { LoginDto, TokenResponseDto } from './dto/login.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  /** Verified when the email doesn't exist, so both failure paths take the same time. */
  private dummyHash = '';

  constructor(
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hasher.hash('dummy-password-for-timing-equalisation');
  }

  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);

    // Always run one scrypt verification. Returning early for an unknown email
    // would answer ~200 ms faster and reveal which emails are registered.
    const valid = await this.hasher.verify(dto.password, user?.passwordHash ?? this.dummyHash);
    if (!user || !valid) {
      // Same message for both cases, for the same reason.
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }),
    };
  }
}
