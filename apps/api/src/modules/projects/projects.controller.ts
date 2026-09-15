import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { TeamsService } from '../teams/teams.service';
import { AssignProjectDto } from './dto/assign-project.dto';
import { ReplaceAssigneeDto } from './dto/replace-assignee.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { RecordAcceptanceDto } from './dto/record-acceptance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly teamsService: TeamsService,
  ) {}

  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m: any) => String(m.id));
  }

  @Get('projects')
  async findProjects(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @CurrentUser() user?: any,
  ) {
    const roles = user?.roles || [];
    const isElevated =
      roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r)) ||
      user?.permissions?.includes('PROJECT_VIEW_ALL');

    let assignedEmployeeIdOnly: string | undefined = undefined;
    let assignedEmployeeIdIn: string[] | undefined = undefined;

    if (!isElevated && user?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
        assignedEmployeeIdIn = teamMemberIds;
      } else {
        assignedEmployeeIdOnly = String(user.employeeId);
      }
    }

    return await this.projectsService.findProjects({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
      status,
      assignedEmployeeIdOnly,
      assignedEmployeeIdIn,
    });
  }

  @Get('projects/:id')
  async findProjectById(@Param('id') id: string, @CurrentUser() user?: any) {
    const project = await this.projectsService.findProjectById(id);

    const roles = user?.roles || [];
    const isElevated =
      roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r)) ||
      user?.permissions?.includes('PROJECT_VIEW_ALL');

    if (!isElevated && user?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
        const hasTeamMember = project.assignments.some(
          (a: any) => a.is_active && teamMemberIds.includes(String(a.employee_id)),
        );
        if (!hasTeamMember) {
          throw new ForbiddenException('You are not authorized to view this project');
        }
      } else {
        const isAssigned = project.assignments.some(
          (a: any) => String(a.employee_id) === String(user.employeeId) && a.is_active,
        );
        if (!isAssigned) {
          throw new ForbiddenException('You are not authorized to view this project');
        }
      }
    }

    const isDevOrSeo =
      roles.includes('DEV') ||
      roles.includes('SEO') ||
      roles.includes('DEV_TEAM_LEADER') ||
      roles.includes('SEO_TEAM_LEADER');
    const isFinancialRedacted = isDevOrSeo && !isElevated && !roles.includes('ACCOUNTANT');

    if (isFinancialRedacted) {
      return {
        ...project,
        net_service_value: null,
        order_item_payment_status: null,
        dependencies: (project.dependencies || []).map((dep: any) => ({
          ...dep,
          required_prerequisite_payment_status: null,
          current_prerequisite_payment_status: null,
        })),
      };
    }

    return project;
  }

  // --------------------------------------------------
  // TASK QUERY ENDPOINTS
  // --------------------------------------------------

  @Get('tasks')
  async findTasks(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @CurrentUser() user?: any,
  ) {
    const roles = user?.roles || [];
    const isElevated =
      roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r)) ||
      user?.permissions?.includes('PROJECT_VIEW_ALL');

    let assignedEmployeeIdOnly: string | undefined = undefined;
    let assignedEmployeeIdIn: string[] | undefined = undefined;

    if (!isElevated && user?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
        assignedEmployeeIdIn = teamMemberIds;
      } else {
        assignedEmployeeIdOnly = String(user.employeeId);
      }
    }

    return await this.projectsService.findTasks({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      projectId,
      assignedEmployeeIdOnly,
      assignedEmployeeIdIn,
    });
  }

  @Get('tasks/:id')
  async findTaskById(@Param('id') id: string, @CurrentUser() user?: any) {
    const task = await this.projectsService.findTaskById(id);

    const roles = user?.roles || [];
    const isElevated =
      roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r)) ||
      user?.permissions?.includes('PROJECT_VIEW_ALL');

    if (!isElevated && user?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
        const isTaskAssigned =
          task.assigned_to_employee_id && teamMemberIds.includes(String(task.assigned_to_employee_id));
        const isProjectAssigned = task.projectAssignments.some(
          (a: any) => a.is_active && teamMemberIds.includes(String(a.employee_id)),
        );
        if (!isTaskAssigned && !isProjectAssigned) {
          throw new ForbiddenException('You are not authorized to view this task');
        }
      } else {
        const isTaskAssigned = String(task.assigned_to_employee_id) === String(user.employeeId);
        const isProjectAssigned = task.projectAssignments.some(
          (a: any) => String(a.employee_id) === String(user.employeeId) && a.is_active,
        );
        if (!isTaskAssigned && !isProjectAssigned) {
          throw new ForbiddenException('You are not authorized to view this task');
        }
      }
    }

    return task;
  }

  // --------------------------------------------------
  // ACCEPTANCE QUERY ENDPOINTS
  // --------------------------------------------------

  @Get('projects/:id/acceptance')
  async findAcceptanceByProjectId(@Param('id') id: string, @CurrentUser() user?: any) {
    const acceptance = await this.projectsService.findAcceptanceByProjectId(id);

    const roles = user?.roles || [];
    const isElevated =
      roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r)) ||
      user?.permissions?.includes('PROJECT_VIEW_ALL');

    if (!isElevated && user?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
        const isProjectAssigned = acceptance.projectAssignments.some(
          (a: any) => a.is_active && teamMemberIds.includes(String(a.employee_id)),
        );
        if (!isProjectAssigned) {
          throw new ForbiddenException('You are not authorized to view this acceptance');
        }
      } else {
        const isProjectAssigned = acceptance.projectAssignments.some(
          (a: any) => String(a.employee_id) === String(user.employeeId) && a.is_active,
        );
        if (!isProjectAssigned) {
          throw new ForbiddenException('You are not authorized to view this acceptance');
        }
      }
    }

    return acceptance;
  }

  @Get('project-acceptances/:id')
  async findAcceptanceById(@Param('id') id: string, @CurrentUser() user?: any) {
    const acceptance = await this.projectsService.findAcceptanceById(id);

    const roles = user?.roles || [];
    const isElevated =
      roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r)) ||
      user?.permissions?.includes('PROJECT_VIEW_ALL');

    if (!isElevated && user?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
        const isProjectAssigned = acceptance.projectAssignments.some(
          (a: any) => a.is_active && teamMemberIds.includes(String(a.employee_id)),
        );
        if (!isProjectAssigned) {
          throw new ForbiddenException('You are not authorized to view this acceptance');
        }
      } else {
        const isProjectAssigned = acceptance.projectAssignments.some(
          (a: any) => String(a.employee_id) === String(user.employeeId) && a.is_active,
        );
        if (!isProjectAssigned) {
          throw new ForbiddenException('You are not authorized to view this acceptance');
        }
      }
    }

    return acceptance;
  }

  private async assertProjectAccess(
    projectId: string,
    user?: any,
    options?: { requireLeaderOrBoss?: boolean },
  ) {
    const roles = user?.roles || [];
    const isElevated =
      roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r)) ||
      user?.permissions?.includes('PROJECT_VIEW_ALL');

    if (isElevated) return;

    if (!user?.employeeId) {
      throw new ForbiddenException('User authentication required');
    }

    if (
      options?.requireLeaderOrBoss &&
      !roles.includes('DEV_TEAM_LEADER') &&
      !roles.includes('SEO_TEAM_LEADER')
    ) {
      throw new ForbiddenException('Only BOSS and Team Leaders have permission for this operation');
    }

    const project = await this.projectsService.findProjectById(projectId);

    if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      const hasTeamMember = project.assignments.some(
        (a: any) => a.is_active && teamMemberIds.includes(String(a.employee_id)),
      );
      if (!hasTeamMember) {
        throw new ForbiddenException('You are not authorized to perform actions on this project');
      }
    } else {
      const isAssigned = project.assignments.some(
        (a: any) => String(a.employee_id) === String(user.employeeId) && a.is_active,
      );
      if (!isAssigned) {
        throw new ForbiddenException('You are not authorized to perform actions on this project');
      }
    }
  }

  @Post('order-items/:id/assign-project')
  @RequirePermissions('PROJECT_ASSIGN')
  async assignProject(
    @Param('id') id: string,
    @Body() dto: AssignProjectDto,
    @CurrentUser() user?: any,
  ) {
    const roles = user?.roles || [];
    const isElevated = roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r));
    if (!isElevated && user?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
        if (!teamMemberIds.includes(String(dto.employeeId))) {
          throw new ForbiddenException('Team Leader can only assign members from their own team');
        }
      } else {
        throw new ForbiddenException('Only BOSS and Team Leaders can assign projects');
      }
    }
    return await this.projectsService.assignProject(id, dto, user?.employeeId);
  }

  @Post('projects/:id/assignments')
  @RequirePermissions('PROJECT_ASSIGN')
  async addAssignment(
    @Param('id') id: string,
    @Body() dto: AssignProjectDto,
    @CurrentUser() user?: any,
  ) {
    const roles = user?.roles || [];
    const isElevated = roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r));
    if (!isElevated && user?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
        if (!teamMemberIds.includes(String(dto.employeeId))) {
          throw new ForbiddenException('Team Leader can only assign members from their own team');
        }
        await this.assertProjectAccess(id, user);
      } else {
        throw new ForbiddenException('Only BOSS and Team Leaders can assign members');
      }
    }
    return await this.projectsService.addAssignment(id, dto, user?.employeeId);
  }

  @Post('projects/:id/replace-assignee')
  @RequirePermissions('PROJECT_ASSIGN')
  async replaceAssignee(
    @Param('id') id: string,
    @Body() dto: ReplaceAssigneeDto,
    @CurrentUser() user?: any,
  ) {
    const roles = user?.roles || [];
    const isElevated = roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r));
    if (!isElevated && user?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
        if (
          !teamMemberIds.includes(String(dto.oldEmployeeId)) ||
          !teamMemberIds.includes(String(dto.newEmployeeId))
        ) {
          throw new ForbiddenException('Team Leader can only replace members within their own team');
        }
        await this.assertProjectAccess(id, user);
      } else {
        throw new ForbiddenException('Only BOSS and Team Leaders can replace assignees');
      }
    }
    return await this.projectsService.replaceAssignee(id, dto, user?.employeeId);
  }

  @Post('projects/:id/ready')
  async markReadyToStart(@Param('id') id: string, @CurrentUser() user?: any) {
    await this.assertProjectAccess(id, user);
    return await this.projectsService.markReadyToStart(id, user?.employeeId);
  }

  @Post('projects/:id/start')
  async startProject(@Param('id') id: string, @CurrentUser() user?: any) {
    await this.assertProjectAccess(id, user);
    return await this.projectsService.startProject(id, user?.employeeId);
  }

  @Post('projects/:id/wait-customer')
  async waitCustomer(@Param('id') id: string, @CurrentUser() user?: any) {
    await this.assertProjectAccess(id, user);
    return await this.projectsService.updateProjectStatus(id, 'WAITING_CUSTOMER', undefined, user?.employeeId);
  }

  @Post('projects/:id/wait-sale')
  async waitSale(@Param('id') id: string, @CurrentUser() user?: any) {
    await this.assertProjectAccess(id, user);
    return await this.projectsService.updateProjectStatus(id, 'WAITING_SALE', undefined, user?.employeeId);
  }

  @Post('projects/:id/wait-internal')
  async waitInternal(@Param('id') id: string, @CurrentUser() user?: any) {
    await this.assertProjectAccess(id, user);
    return await this.projectsService.updateProjectStatus(id, 'WAITING_INTERNAL', undefined, user?.employeeId);
  }

  @Post('projects/:id/block')
  async blockProject(
    @Param('id') id: string,
    @Body('reason') reason?: string,
    @CurrentUser() user?: any,
  ) {
    await this.assertProjectAccess(id, user);
    return await this.projectsService.updateProjectStatus(id, 'BLOCKED', reason, user?.employeeId);
  }

  @Post('projects/:id/review')
  async reviewProject(@Param('id') id: string, @CurrentUser() user?: any) {
    await this.assertProjectAccess(id, user);
    return await this.projectsService.updateProjectStatus(id, 'REVIEW', undefined, user?.employeeId);
  }

  @Post('projects/:id/request-acceptance')
  @Post('projects/:id/acceptance')
  async recordAcceptance(
    @Param('id') id: string,
    @Body() dto: RecordAcceptanceDto,
    @CurrentUser() user?: any,
  ) {
    await this.assertProjectAccess(id, user, { requireLeaderOrBoss: true });
    const recordedBy = user?.employeeId ? String(user.employeeId) : '1';
    return await this.projectsService.recordAcceptance(id, dto, recordedBy);
  }

  @Post('projects/:id/cancel')
  async cancelProject(@Param('id') id: string, @CurrentUser() user?: any) {
    const roles = user?.roles || [];
    const isElevated = roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r));
    if (!isElevated) {
      throw new ForbiddenException('Only BOSS or ADMIN can cancel a project');
    }
    return await this.projectsService.cancelProject(id, user?.employeeId);
  }

  // --------------------------------------------------
  // TASK ENDPOINTS
  // --------------------------------------------------

  @Post('projects/:id/tasks')
  async createTask(
    @Param('id') id: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user?: any,
  ) {
    await this.assertProjectAccess(id, user);
    return await this.projectsService.createTask(id, dto, user?.employeeId);
  }

  @Post('tasks/:id/start')
  async startTask(@Param('id') id: string, @CurrentUser() user?: any) {
    const task = await this.projectsService.findTaskById(id);
    await this.assertProjectAccess(String(task.project_id), user);
    return await this.projectsService.startTask(id, user?.employeeId);
  }

  @Post('tasks/:id/block')
  async blockTask(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user?: any,
  ) {
    const task = await this.projectsService.findTaskById(id);
    await this.assertProjectAccess(String(task.project_id), user);
    return await this.projectsService.blockTask(id, reason, user?.employeeId);
  }

  @Post('tasks/:id/complete')
  async completeTask(@Param('id') id: string, @CurrentUser() user?: any) {
    const task = await this.projectsService.findTaskById(id);
    await this.assertProjectAccess(String(task.project_id), user);
    return await this.projectsService.completeTask(id, user?.employeeId);
  }
}
