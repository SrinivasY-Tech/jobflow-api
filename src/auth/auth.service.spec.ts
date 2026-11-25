import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnvConfig } from '../config/env.validation';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { Role } from './role.enum';

describe('AuthService.login', () => {
  const hasher = { hash: jest.fn().mockResolvedValue('dummy-hash'), verify: jest.fn() };
  const users = { findByEmailWithPassword: jest.fn() };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
  const config = { get: jest.fn().mockReturnValue(900) };

  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = new AuthService(
      users as unknown as UsersService,
      hasher,
      jwt as unknown as JwtService,
      config as unknown as ConfigService<EnvConfig, true>,
    );
    await service.onModuleInit();
  });

  it('returns a bearer token with sub and role for valid credentials', async () => {
    users.findByEmailWithPassword.mockResolvedValue({ id: 4, role: Role.OPERATOR, passwordHash: 'h' });
    hasher.verify.mockResolvedValue(true);

    await expect(service.login({ email: 'op@example.com', password: 'pw' })).resolves.toEqual({
      accessToken: 'signed.jwt.token',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 4, role: Role.OPERATOR });
  });

  it('rejects a wrong password with the generic message', async () => {
    users.findByEmailWithPassword.mockResolvedValue({ id: 4, role: Role.OPERATOR, passwordHash: 'h' });
    hasher.verify.mockResolvedValue(false);
    await expect(service.login({ email: 'op@example.com', password: 'bad' })).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );
  });

  it('still runs a hash verification for an unknown email (no timing leak), same message', async () => {
    users.findByEmailWithPassword.mockResolvedValue(null);
    hasher.verify.mockResolvedValue(false);

    await expect(service.login({ email: 'nobody@example.com', password: 'x' })).rejects.toThrow(
      'Invalid email or password',
    );
    expect(hasher.verify).toHaveBeenCalledWith('x', 'dummy-hash');
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
