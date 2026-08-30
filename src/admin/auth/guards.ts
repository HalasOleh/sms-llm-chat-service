import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import type { AdminTokenPayload } from './auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * The role check is separate from the token check.
 *
 * Not separation for ceremony's sake: "who are you" and "what are you allowed
 * to do" are different questions, and when a second role appears (say,
 * support with access only to their own conversations) this guard is the only
 * thing that changes.
 *
 * 401 versus 403 is not incidental either: JwtAuthGuard answers 401 ("I don't
 * know who you are"), this one answers 403 ("I do, and you may not").
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AdminTokenPayload | undefined;

    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
