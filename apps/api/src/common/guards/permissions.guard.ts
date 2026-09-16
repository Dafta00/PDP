import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { Permission } from '../authorization/permissions';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Fine-grained permission gate, layered on top of the coarse-grained
 * @Roles/RolesGuard check already on most controllers. A route with no
 * @RequirePermissions is unaffected (this guard passes it through) — the
 * two are meant to compose, not replace one another: role authority answers
 * "is this kind of user allowed near this endpoint at all", permissions
 * answer "does *this* user specifically have the capability".
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) throw new ForbiddenException('You do not have permission to perform this action.');

    for (const permission of required) {
      if (await this.authorization.hasPermission(user, permission)) return true;
    }
    throw new ForbiddenException('You do not have permission to perform this action.');
  }
}
