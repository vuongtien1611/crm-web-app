import * as assert from 'node:assert/strict';
import { AuthorizationService } from './authorization.service';

const authorizationService = new AuthorizationService();

const adminScope = authorizationService.resolveEmployeeScope({ roles: ['ADMIN'] });
assert.equal(adminScope.type, 'all');
assert.equal(authorizationService.canAccessEmployee(adminScope, '42'), true);

const teamScope = authorizationService.resolveEmployeeScope(
  { employeeId: '10', roles: ['SALES_TEAM_LEADER'] },
  { teamRoles: ['SALES_TEAM_LEADER'], teamEmployeeIds: ['11', 12] },
);
assert.deepEqual(teamScope, { type: 'team', employeeIds: ['10', '11', '12'] });
assert.equal(authorizationService.canAccessEmployee(teamScope, 12), true);
assert.equal(authorizationService.canAccessEmployee(teamScope, '99'), false);

const missingEmployeeScope = authorizationService.resolveEmployeeScope({ roles: ['SALE'] });
assert.equal(missingEmployeeScope.type, 'none');
assert.equal(authorizationService.canAccessEmployee(missingEmployeeScope, '10'), false);
