import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EmployeesModule } from '../employees/employees.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [UsersModule, EmployeesModule, RbacModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService, JwtAuthGuard],
  exports: [AuthService, PasswordService, SessionService, JwtAuthGuard],
})
export class AuthModule {}
