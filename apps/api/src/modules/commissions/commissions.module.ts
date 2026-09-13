import { Module } from '@nestjs/common';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { CommissionPolicyMatcherService } from './services/commission-policy-matcher.service';
import { CommissionEligibilityService } from './services/commission-eligibility.service';
import { KyselyModule } from '../../database/kysely.module';
import { RbacModule } from '../rbac/rbac.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [KyselyModule, RbacModule, TeamsModule],
  controllers: [CommissionsController],
  providers: [
    CommissionsService,
    CommissionPolicyMatcherService,
    CommissionEligibilityService,
  ],
  exports: [
    CommissionsService,
    CommissionPolicyMatcherService,
    CommissionEligibilityService,
  ],
})
export class CommissionsModule {}

