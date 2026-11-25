import { Request } from 'express';
import { Role } from './role.enum';

/** Claims we put in the access token. `sub` (subject) is the user id. */
export interface JwtPayload {
  sub: number;
  role: Role;
}

/** What JwtAuthGuard attaches to the request after verifying the token. */
export interface AuthUser {
  id: number;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
