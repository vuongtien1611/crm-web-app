import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class BossOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.roles || !user.roles.includes('BOSS')) {
      throw new ForbiddenException('Access denied: Only BOSS can access this resource');
    }

    return true;
  }
}
