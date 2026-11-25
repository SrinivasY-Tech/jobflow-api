import { SetMetadata } from '@nestjs/common';
import { Role } from '../role.enum';

export const ROLES_KEY = 'roles';

/**
 * Declares which roles may call a route (or every route in a controller).
 * It only stores metadata; RolesGuard reads it via Reflector and enforces it.
 * A method-level @Roles overrides a class-level one.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
