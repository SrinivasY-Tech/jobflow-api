import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedRequest } from '../auth-user';
import { Role } from '../role.enum';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'unit-test-secret-that-is-at-least-32-chars';
const jwt = new JwtService({ secret: SECRET, signOptions: { algorithm: 'HS256', expiresIn: 60 } });

function run(authorization: string | undefined, isPublic = false) {
  const request = { headers: { authorization } } as AuthenticatedRequest;
  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  return { promise: new JwtAuthGuard(reflector, jwt).canActivate(context), request };
}

describe('JwtAuthGuard', () => {
  it('attaches { id, role } for a valid token', async () => {
    const token = await jwt.signAsync({ sub: 7, role: Role.PLANNER });
    const { promise, request } = run(`Bearer ${token}`);
    await expect(promise).resolves.toBe(true);
    expect(request.user).toEqual({ id: 7, role: Role.PLANNER });
  });

  it('lets @Public routes through without a token', async () => {
    await expect(run(undefined, true).promise).resolves.toBe(true);
  });

  it.each([
    ['missing header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['garbage', 'Bearer not.a.jwt'],
  ])('401s for %s', async (_label, header) => {
    await expect(run(header).promise).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401s for a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'x'.repeat(40) }).signAsync({ sub: 1, role: Role.ADMIN });
    await expect(run(`Bearer ${forged}`).promise).rejects.toThrow('Invalid or expired token');
  });

  it('401s for an expired token', async () => {
    // Same secret, but no default expiresIn, so we can set a past `exp` ourselves.
    const signer = new JwtService({ secret: SECRET });
    const expired = await signer.signAsync({ sub: 1, role: Role.ADMIN, exp: Math.floor(Date.now() / 1000) - 10 });
    await expect(run(`Bearer ${expired}`).promise).rejects.toThrow('Invalid or expired token');
  });

  it('401s for a correctly signed token with an unknown role', async () => {
    const token = await jwt.signAsync({ sub: 1, role: 'superuser' });
    await expect(run(`Bearer ${token}`).promise).rejects.toThrow('Invalid token claims');
  });
});
