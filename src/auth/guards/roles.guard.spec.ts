import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../role.enum';
import { RolesGuard } from './roles.guard';

function contextFor(user?: { id: number; role: Role }): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(meta: { public?: boolean; roles?: Role[] }): RolesGuard {
  const reflector = {
    getAllAndOverride: (key: string) => (key === IS_PUBLIC_KEY ? meta.public : meta.roles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows @Public routes without a user', () => {
    expect(guardWith({ public: true }).canActivate(contextFor())).toBe(true);
  });

  it('fails closed: denies a protected route that has no @Roles', () => {
    expect(() => guardWith({}).canActivate(contextFor({ id: 1, role: Role.ADMIN }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a user whose role is listed', () => {
    const guard = guardWith({ roles: [Role.PLANNER, Role.OPERATOR] });
    expect(guard.canActivate(contextFor({ id: 1, role: Role.OPERATOR }))).toBe(true);
  });

  it('denies a user whose role is not listed (admin is not a superuser)', () => {
    const guard = guardWith({ roles: [Role.PLANNER] });
    expect(() => guard.canActivate(contextFor({ id: 1, role: Role.ADMIN }))).toThrow(
      'Requires role: planner',
    );
  });

  it('reads metadata with the method-over-class precedence', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => (key === ROLES_KEY ? [Role.ADMIN] : undefined)),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    guard.canActivate(contextFor({ id: 1, role: Role.ADMIN }));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
  });
});
