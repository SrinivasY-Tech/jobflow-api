import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedRequest, JwtPayload } from '../auth-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALL_ROLES } from '../role.enum';

/**
 * Guard 1 of 2 (registered globally, runs first): "WHO are you?"
 * Verifies the Bearer token and attaches { id, role } to request.user.
 * Answers 401 if the token is missing, malformed, expired or wrongly signed.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: JwtPayload;
    try {
      // Checks the signature and `exp`. Algorithms are pinned so a token
      // can't choose its own algorithm (e.g. "none").
      payload = await this.jwt.verifyAsync<JwtPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // A valid signature means we issued it, but check the shape anyway.
    if (!Number.isInteger(payload.sub) || !ALL_ROLES.includes(payload.role)) {
      throw new UnauthorizedException('Invalid token claims');
    }

    request.user = { id: payload.sub, role: payload.role };
    return true;
  }

  private extractBearerToken(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
