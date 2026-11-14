import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthorizationService } from './authorization.service';

@Module({
  providers: [RbacService, PermissionsGuard, AuthorizationService],
  exports: [RbacService, PermissionsGuard, AuthorizationService],
})
export class RbacModule {}
