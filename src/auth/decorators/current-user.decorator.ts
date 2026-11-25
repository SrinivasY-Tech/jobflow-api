import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { AuthenticatedRequest, AuthUser } from '../auth-user';

/** Injects the authenticated user that JwtAuthGuard attached to the request. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  // Only reachable if @CurrentUser is used on a @Public route: a programming error.
  if (!user) throw new InternalServerErrorException('No authenticated user on request');
  return user;
});
