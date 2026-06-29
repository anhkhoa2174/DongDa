// Roles Guard
// Layer: Interface — kiểm tra role sau khi JWT đã verify

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../domain/entities/user.entity';

export const ROLES_KEY = 'roles';

// Decorator dùng trong controller: @Roles(UserRole.ADMIN)
import { SetMetadata } from '@nestjs/common';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }

    return true;
  }
}
