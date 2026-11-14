import { Injectable, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import { KyselyService, CrmTransaction } from '../../database/kysely.service';
import { AssignProjectDto, AssignmentType } from './dto/assign-project.dto';
import { ReplaceAssigneeDto } from './dto/replace-assignee.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { RecordAcceptanceDto } from './dto/record-acceptance.dto';
import { sql } from 'kysely';
import { CommissionEligibilityService } from '../commissions/services/commission-eligibility.service';
import { KpiEvaluationService } from '../kpi/services/kpi-evaluation.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface FindProjectsFilter {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  assignedEmployeeIdOnly?: string; // Object-level authorization
  assignedEmployeeIdIn?: string[]; // Team-scope authorization
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly commissionEligibilityService?: CommissionEligibilityService,
    @Optional() private readonly kpiEvaluationService?: KpiEvaluationService,
  ) {}

  // --------------------------------------------------
  // AUDIT LOG HELPER
  // --------------------------------------------------
  private async logAudit(
    trx: CrmTransaction,
    action: string,
    entityType: string,
    entityId: string | number,
    actorEmployeeId?: string | number | null,
    payloadBefore?: Record<string, unknown> | null,
    payloadAfter?: Record<string, unknown> | null,
  ) {
    await trx
      .insertInto('audit_logs')
      .values({
        actor_employee_id: actorEmployeeId ? (actorEmployeeId as any) : null,
        actor_type: 'USER',
        action,
        entity_type: entityType,
        entity_id: entityId as any,
        payload_before_sanitized: payloadBefore ? JSON.stringify(payloadBefore) : null,
        payload_after_sanitized: payloadAfter ? JSON.stringify(payloadAfter) : null,
      })
      .execute();
  }

  // --------------------------------------------------
  // PROJECT CREATION & ASSIGNMENT
  // --------------------------------------------------

  async assignProject(orderItemId: string, dto: AssignProjectDto, actorEmployeeId?: string) {
    const res = await this.kysely.db.transaction().execute(async (trx) => {
      const orderItem = await trx
        .selectFrom('order_items as oi')
        .innerJoin('services as s', 's.id', 'oi.service_id')
        .select([
          'oi.id',
          'oi.approval_status',
          'oi.delivery_status',
          's.name as service_name',
        ])
        .where('oi.id', '=', orderItemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!orderItem) {
        throw new NotFoundException(`OrderItem [${orderItemId}] not found`);
      }

      if (orderItem.approval_status !== 'APPROVED') {
        throw new BadRequestException(`Cannot create project for an unapproved OrderItem (current: ${orderItem.approval_status})`);
      }

      if (orderItem.delivery_status !== 'READY_FOR_ASSIGNMENT' && orderItem.delivery_status !== 'PENDING') {
        throw new BadRequestException(`OrderItem is not ready for project assignment (current: ${orderItem.delivery_status})`);
      }

      // Check if project already exists for this order_item
      const existingProject = await trx
        .selectFrom('projects')
        .selectAll()
        .where('order_item_id', '=', orderItem.id)
        .executeTakeFirst();

      if (existingProject) {
        throw new BadRequestException(`Project already exists for OrderItem [${orderItemId}]`);
      }

      // Create Project
      const [project] = await trx
        .insertInto('projects')
        .values({
          order_item_id: orderItem.id,
          project_name: `Project - ${orderItem.service_name}`,
          status: 'ASSIGNED',
          materialized_progress_percent: 0,
        })
        .returningAll()
        .execute();

      // Update OrderItem delivery_status to READY_FOR_ASSIGNMENT if it was PENDING
      await trx
        .updateTable('order_items')
        .set({ delivery_status: 'READY_FOR_ASSIGNMENT', updated_at: new Date() })
        .where('id', '=', orderItem.id)
        .execute();

      // Create initial Project Assignment
      const [assignment] = await trx
        .insertInto('project_assignments')
        .values({
          project_id: project.id,
          employee_id: dto.employeeId as any,
          assignment_type: dto.assignmentType,
          is_active: true,
          assigned_at: new Date(),
        })
        .returningAll()
        .execute();

      // Create default Milestone
      await trx
        .insertInto('project_milestones')
        .values({
          project_id: project.id,
          title: 'General Implementation',
          weight: 100,
          sort_order: 1,
        })
        .execute();

      await this.logAudit(trx, 'PROJECT_CREATE_ASSIGN', 'projects', project.id, actorEmployeeId, null, { project, assignment });

      if (this.notificationsService) {
        await this.notificationsService.createNotification(
          {
            employeeId: dto.employeeId,
            eventType: 'PROJECT_ASSIGNED',
            title: `Bạn được phân công vào dự án #${project.id}`,
            content: `Vai trò: ${dto.assignmentType} trong dự án`,
            deepLinkUrl: `/projects/${project.id}`,
            entityType: 'projects',
            entityId: project.id,
          },
          trx,
        );
      }

      return { project, assignment };
    });

    return res;
  }

  async addAssignment(projectId: string, dto: AssignProjectDto, actorEmployeeId?: string) {
    const assignment = await this.kysely.db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', projectId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!project) {
        throw new NotFoundException(`Project [${projectId}] not found`);
      }

      if (dto.assignmentType === AssignmentType.PRIMARY) {
        // Enforce MAX 2 ACTIVE PRIMARY assignees rule
        const activePrimaryCount = await trx
          .selectFrom('project_assignments')
          .select(sql<number>`count(id)`.as('count'))
          .where('project_id', '=', project.id)
          .where('assignment_type', '=', 'PRIMARY')
          .where('is_active', '=', true)
          .executeTakeFirst();

        if (Number(activePrimaryCount?.count || 0) >= 2) {
          throw new BadRequestException('Max 2 active PRIMARY assignees allowed per project');
        }
      }

      // Check if employee already has active assignment
      const existing = await trx
        .selectFrom('project_assignments')
        .selectAll()
        .where('project_id', '=', project.id)
        .where('employee_id', '=', dto.employeeId as any)
        .where('is_active', '=', true)
        .executeTakeFirst();

      if (existing) {
        throw new BadRequestException(`Employee [${dto.employeeId}] is already actively assigned to this project`);
      }

      const [newAssignment] = await trx
        .insertInto('project_assignments')
        .values({
          project_id: project.id,
          employee_id: dto.employeeId as any,
          assignment_type: dto.assignmentType,
          is_active: true,
          assigned_at: new Date(),
        })
        .returningAll()
        .execute();

      await this.logAudit(trx, 'PROJECT_ADD_ASSIGNMENT', 'projects', project.id, actorEmployeeId, null, newAssignment);

      if (this.notificationsService) {
        await this.notificationsService.createNotification(
          {
            employeeId: dto.employeeId,
            eventType: 'PROJECT_ASSIGNED',
            title: `Bạn được phân công vào dự án #${projectId}`,
            content: `Vai trò: ${dto.assignmentType} trong dự án #${projectId}`,
            deepLinkUrl: `/projects/${projectId}`,
            entityType: 'projects',
            entityId: projectId,
          },
          trx,
        );
      }

      return newAssignment;
    });

    return assignment;
  }

  async replaceAssignee(projectId: string, dto: ReplaceAssigneeDto, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', projectId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!project) {
        throw new NotFoundException(`Project [${projectId}] not found`);
      }

      // Find active assignment for old employee
      const oldAssignment = await trx
        .selectFrom('project_assignments')
        .selectAll()
        .where('project_id', '=', project.id)
        .where('employee_id', '=', dto.oldEmployeeId as any)
        .where('is_active', '=', true)
        .executeTakeFirst();

      if (!oldAssignment) {
        throw new NotFoundException(`Active assignment for old employee [${dto.oldEmployeeId}] not found`);
      }

      // Close old assignment history
      await trx
        .updateTable('project_assignments')
        .set({
          is_active: false,
          unassigned_at: new Date(),
          replacement_reason: dto.replacementReason,
        })
        .where('id', '=', oldAssignment.id)
        .execute();

      // Create new active assignment
      const [newAssignment] = await trx
        .insertInto('project_assignments')
        .values({
          project_id: project.id,
          employee_id: dto.newEmployeeId as any,
          assignment_type: oldAssignment.assignment_type,
          is_active: true,
          assigned_at: new Date(),
        })
        .returningAll()
        .execute();

      await this.logAudit(trx, 'PROJECT_REPLACE_ASSIGNEE', 'projects', project.id, actorEmployeeId, oldAssignment, newAssignment);
      return newAssignment;
    });
  }

  // --------------------------------------------------
  // DEPENDENCY EVALUATION & START CONDITIONS
  // --------------------------------------------------

  async evaluateReadyToStart(projectId: string) {
    const project = await this.kysely.db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', projectId as any)
      .executeTakeFirst();

    if (!project) {
      throw new NotFoundException(`Project [${projectId}] not found`);
    }

    // Check order_item_dependencies
    const dependencies = await this.kysely.db
      .selectFrom('order_item_dependencies as oid')
      .innerJoin('order_items as prereq', 'prereq.id', 'oid.prerequisite_item_id')
      .select([
        'oid.id',
        'oid.required_prerequisite_delivery_status',
        'oid.required_prerequisite_payment_status',
        'oid.is_unlocked',
        'prereq.delivery_status',
        'prereq.payment_status',
      ])
      .where('oid.dependent_item_id', '=', project.order_item_id)
      .execute();

    for (const dep of dependencies) {
      const deliveryOk = dep.delivery_status === dep.required_prerequisite_delivery_status;
      const paymentOk = dep.payment_status === dep.required_prerequisite_payment_status;

      if (!deliveryOk || !paymentOk) {
        return {
          ready: false,
          reason: `Prerequisite dependency item not satisfied (Delivery: ${dep.delivery_status}/${dep.required_prerequisite_delivery_status}, Payment: ${dep.payment_status}/${dep.required_prerequisite_payment_status})`,
        };
      }
    }

    return { ready: true };
  }

  async markReadyToStart(projectId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', projectId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!project) {
        throw new NotFoundException(`Project [${projectId}] not found`);
      }

      const evalRes = await this.evaluateReadyToStart(projectId);
      if (!evalRes.ready) {
        throw new BadRequestException(`Cannot set READY_TO_START: ${evalRes.reason}`);
      }

      const [updatedProject] = await trx
        .updateTable('projects')
        .set({ status: 'READY_TO_START', updated_at: new Date() })
        .where('id', '=', project.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'PROJECT_MARK_READY_TO_START', 'projects', project.id, actorEmployeeId, project, updatedProject);
      return updatedProject;
    });
  }

  async startProject(projectId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', projectId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!project) {
        throw new NotFoundException(`Project [${projectId}] not found`);
      }

      if (project.status !== 'READY_TO_START' && project.status !== 'ASSIGNED') {
        throw new BadRequestException(`Project must be in READY_TO_START or ASSIGNED status to start (current: ${project.status})`);
      }

      // Evaluate dependencies before starting
      const evalRes = await this.evaluateReadyToStart(projectId);
      if (!evalRes.ready) {
        throw new BadRequestException(`Cannot start project: ${evalRes.reason}`);
      }

      const [updatedProject] = await trx
        .updateTable('projects')
        .set({
          status: 'IN_PROGRESS',
          started_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', project.id)
        .returningAll()
        .execute();

      // Synchronize OrderItem delivery_status -> IN_PROGRESS
      await trx
        .updateTable('order_items')
        .set({ delivery_status: 'IN_PROGRESS', updated_at: new Date() })
        .where('id', '=', project.order_item_id)
        .execute();

      await this.logAudit(trx, 'PROJECT_START', 'projects', project.id, actorEmployeeId, project, updatedProject);
      return updatedProject;
    });
  }

  async updateProjectStatus(projectId: string, newStatus: string, reason?: string, actorEmployeeId?: string) {
    const validStatuses = [
      'WAITING_CUSTOMER',
      'WAITING_SALE',
      'WAITING_INTERNAL',
      'BLOCKED',
      'REVIEW',
      'ACCEPTANCE',
    ];
    if (!validStatuses.includes(newStatus)) {
      throw new BadRequestException(`Invalid project status transition: ${newStatus}`);
    }

    return await this.kysely.db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', projectId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!project) {
        throw new NotFoundException(`Project [${projectId}] not found`);
      }

      const [updatedProject] = await trx
        .updateTable('projects')
        .set({ status: newStatus as any, updated_at: new Date() })
        .where('id', '=', project.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, `PROJECT_STATUS_${newStatus}`, 'projects', project.id, actorEmployeeId, { ...project, reason }, updatedProject);

      if (this.notificationsService) {
        if (newStatus === 'BLOCKED') {
          await this.notificationsService.notifyRoles(
            ['BOSS', 'ADMIN'],
            {
              eventType: 'PROJECT_BLOCKED',
              title: 'Dự án bị chặn (Blocked)',
              content: `Dự án ${project.project_name || project.id} đã chuyển sang trạng thái BLOCKED. Lý do: ${reason || 'Không có'}`,
              deepLinkUrl: `/projects/${project.id}`,
              entityType: 'PROJECT',
              entityId: String(project.id),
            },
            trx,
          );
        } else if (newStatus === 'ACCEPTANCE') {
          await this.notificationsService.notifyRoles(
            ['BOSS', 'ADMIN'],
            {
              eventType: 'PROJECT_ACCEPTANCE',
              title: 'Dự án chuyển sang nghiệm thu (Acceptance)',
              content: `Dự án ${project.project_name || project.id} đã chuyển sang trạng thái ACCEPTANCE.`,
              deepLinkUrl: `/projects/${project.id}`,
              entityType: 'PROJECT',
              entityId: String(project.id),
            },
            trx,
          );
        }
      }

      return updatedProject;
    });
  }

  // --------------------------------------------------
  // TASK MANAGEMENT & PROGRESS DERIVATION
  // --------------------------------------------------

  private async recalculateProgress(trx: CrmTransaction, projectId: string) {
    // Get all tasks for this project
    const milestones = await trx
      .selectFrom('project_milestones')
      .select('id')
      .where('project_id', '=', projectId)
      .execute();

    const milestoneIds = milestones.map((m) => m.id);
    if (milestoneIds.length === 0) {
      await trx
        .updateTable('projects')
        .set({ materialized_progress_percent: 0 })
        .where('id', '=', projectId as any)
        .execute();
      return 0;
    }

    const tasks = await trx
      .selectFrom('project_tasks')
      .selectAll()
      .where('milestone_id', 'in', milestoneIds)
      .execute();

    if (tasks.length === 0) {
      await trx
        .updateTable('projects')
        .set({ materialized_progress_percent: 0 })
        .where('id', '=', projectId as any)
        .execute();
      return 0;
    }

    let totalWeight = 0;
    let completedWeight = 0;

    for (const task of tasks) {
      const w = Number(task.weight) || 10;
      totalWeight += w;
      if (task.status === 'DONE') {
        completedWeight += w;
      }
    }

    const percent = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100 * 100) / 100 : 0;

    await trx
      .updateTable('projects')
      .set({ materialized_progress_percent: percent, updated_at: new Date() })
      .where('id', '=', projectId as any)
      .execute();

    return percent;
  }

  async createTask(projectId: string, dto: CreateTaskDto, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', projectId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!project) {
        throw new NotFoundException(`Project [${projectId}] not found`);
      }

      let milestoneId = dto.milestoneId;
      if (!milestoneId) {
        let milestone = await trx
          .selectFrom('project_milestones')
          .selectAll()
          .where('project_id', '=', project.id)
          .executeTakeFirst();

        if (!milestone) {
          const [newM] = await trx
            .insertInto('project_milestones')
            .values({ project_id: project.id, title: 'General Tasks', weight: 100 })
            .returningAll()
            .execute();
          milestone = newM;
        }
        milestoneId = String(milestone.id);
      }

      const [task] = await trx
        .insertInto('project_tasks')
        .values({
          milestone_id: milestoneId as any,
          assigned_to_employee_id: dto.assignedToEmployeeId ? (dto.assignedToEmployeeId as any) : null,
          title: dto.title,
          weight: dto.weight || 10,
          status: 'TODO',
        })
        .returningAll()
        .execute();

      await this.recalculateProgress(trx, project.id);
      await this.logAudit(trx, 'TASK_CREATE', 'project_tasks', task.id, actorEmployeeId, null, task);
      return task;
    });
  }

  async startTask(taskId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom('project_tasks')
        .selectAll()
        .where('id', '=', taskId as any)
        .executeTakeFirst();

      if (!task) {
        throw new NotFoundException(`Task [${taskId}] not found`);
      }

      const [updatedTask] = await trx
        .updateTable('project_tasks')
        .set({ status: 'IN_PROGRESS', updated_at: new Date() })
        .where('id', '=', task.id)
        .returningAll()
        .execute();

      const milestone = await trx
        .selectFrom('project_milestones')
        .select('project_id')
        .where('id', '=', task.milestone_id)
        .executeTakeFirst();

      if (milestone) {
        await this.recalculateProgress(trx, milestone.project_id);
      }

      await this.logAudit(trx, 'TASK_START', 'project_tasks', task.id, actorEmployeeId, task, updatedTask);
      return updatedTask;
    });
  }

  async blockTask(taskId: string, reason: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom('project_tasks')
        .selectAll()
        .where('id', '=', taskId as any)
        .executeTakeFirst();

      if (!task) {
        throw new NotFoundException(`Task [${taskId}] not found`);
      }

      const [updatedTask] = await trx
        .updateTable('project_tasks')
        .set({
          status: 'BLOCKED',
          blocked_reason: reason,
          blocked_since: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', task.id)
        .returningAll()
        .execute();

      const milestone = await trx
        .selectFrom('project_milestones')
        .select('project_id')
        .where('id', '=', task.milestone_id)
        .executeTakeFirst();

      if (milestone) {
        await this.recalculateProgress(trx, milestone.project_id);
      }

      await this.logAudit(trx, 'TASK_BLOCK', 'project_tasks', task.id, actorEmployeeId, task, updatedTask);
      return updatedTask;
    });
  }

  async completeTask(taskId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const task = await trx
        .selectFrom('project_tasks')
        .selectAll()
        .where('id', '=', taskId as any)
        .executeTakeFirst();

      if (!task) {
        throw new NotFoundException(`Task [${taskId}] not found`);
      }

      const [updatedTask] = await trx
        .updateTable('project_tasks')
        .set({
          status: 'DONE',
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', task.id)
        .returningAll()
        .execute();

      const milestone = await trx
        .selectFrom('project_milestones')
        .select('project_id')
        .where('id', '=', task.milestone_id)
        .executeTakeFirst();

      if (milestone) {
        await this.recalculateProgress(trx, milestone.project_id);
      }

      await this.logAudit(trx, 'TASK_COMPLETE', 'project_tasks', task.id, actorEmployeeId, task, updatedTask);
      return updatedTask;
    });
  }

  // --------------------------------------------------
  // CUSTOMER ACCEPTANCE & COMPLETION
  // --------------------------------------------------

  async recordAcceptance(projectId: string, dto: RecordAcceptanceDto, recordedByEmployeeId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', projectId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!project) {
        throw new NotFoundException(`Project [${projectId}] not found`);
      }

      if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
        throw new BadRequestException(`Cannot record acceptance for project in status ${project.status}`);
      }

      // Check if project_acceptance already exists (Unique constraint protection)
      const existingAcceptance = await trx
        .selectFrom('project_acceptances')
        .selectAll()
        .where('project_id', '=', project.id)
        .executeTakeFirst();

      if (existingAcceptance) {
        throw new BadRequestException('Project acceptance already recorded');
      }

      const customerContactId = dto.customerContactId || dto.contactId;
      if (!customerContactId) {
        throw new BadRequestException('customerContactId or contactId is required');
      }

      const acceptedByName = dto.acceptedByName || dto.representativeName;
      if (!acceptedByName) {
        throw new BadRequestException('acceptedByName or representativeName is required');
      }

      const evidenceDocument = dto.evidenceDocument || dto.acceptanceEvidenceUrl;
      if (!evidenceDocument) {
        throw new BadRequestException('evidenceDocument or acceptanceEvidenceUrl is required');
      }

      // Insert project_acceptances row
      const [acceptance] = await trx
        .insertInto('project_acceptances')
        .values({
          project_id: project.id,
          customer_contact_id: customerContactId as any,
          accepted_by_name: acceptedByName,
          accepted_at: new Date(),
          evidence_document: evidenceDocument,
          recorded_by_employee_id: recordedByEmployeeId as any,
        })
        .returningAll()
        .execute();

      // Update Project status -> COMPLETED
      const [completedProject] = await trx
        .updateTable('projects')
        .set({
          status: 'COMPLETED',
          completed_at: new Date(),
          materialized_progress_percent: 100,
          updated_at: new Date(),
        })
        .where('id', '=', project.id)
        .returningAll()
        .execute();

      // Synchronize OrderItem delivery_status -> COMPLETED
      // NOTE: Payment status remains UNPAID or PARTIALLY_PAID (NOT automatically set to FULLY_PAID!)
      await trx
        .updateTable('order_items')
        .set({ delivery_status: 'COMPLETED', updated_at: new Date() })
        .where('id', '=', project.order_item_id)
        .execute();

      // Transactional downstream hooks for Commission & KPI eligibility
      if (this.commissionEligibilityService) {
        await this.commissionEligibilityService.evaluateOrderItemCommissions(trx, String(project.order_item_id), recordedByEmployeeId);
      }
      if (this.kpiEvaluationService) {
        await this.kpiEvaluationService.evaluateProjectAcceptanceKpi(trx, String(project.id), recordedByEmployeeId);
      }

      await this.logAudit(trx, 'PROJECT_ACCEPTANCE_RECORD', 'projects', project.id, recordedByEmployeeId, project, completedProject);

      if (this.notificationsService) {
        await this.notificationsService.notifyRoles(
          ['BOSS', 'ADMIN'],
          {
            eventType: 'PROJECT_COMPLETED',
            title: 'Dự án hoàn thành',
            content: `Dự án ${project.project_name || project.id} đã hoàn tất nghiệm thu và chuyển sang trạng thái COMPLETED.`,
            deepLinkUrl: `/projects/${project.id}`,
            entityType: 'PROJECT',
            entityId: String(project.id),
          },
          trx,
        );
      }

      return { project: completedProject, acceptance };
    });
  }

  async cancelProject(projectId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', projectId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!project) {
        throw new NotFoundException(`Project [${projectId}] not found`);
      }

      if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
        throw new BadRequestException(`Cannot cancel project in status ${project.status}`);
      }

      const [cancelledProject] = await trx
        .updateTable('projects')
        .set({ status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', project.id)
        .returningAll()
        .execute();

      // Synchronize OrderItem delivery_status -> CANCELLED
      await trx
        .updateTable('order_items')
        .set({ delivery_status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', project.order_item_id)
        .execute();

      await this.logAudit(trx, 'PROJECT_CANCEL', 'projects', project.id, actorEmployeeId, project, cancelledProject);
      return cancelledProject;
    });
  }

  // --------------------------------------------------
  // QUERIES & LISTINGS
  // --------------------------------------------------

  async findProjects(filter: FindProjectsFilter) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 10));
    const offset = (page - 1) * limit;

    let query = this.kysely.db
      .selectFrom('projects as p')
      .innerJoin('order_items as oi', 'oi.id', 'p.order_item_id')
      .innerJoin('orders as o', 'o.id', 'oi.order_id')
      .innerJoin('accounts as a', 'a.id', 'o.account_id')
      .innerJoin('services as s', 's.id', 'oi.service_id');

    if (filter.status) {
      query = query.where('p.status', '=', filter.status as any);
    }

    if (filter.q) {
      const searchTerm = `%${filter.q}%`;
      query = query.where((eb) =>
        eb.or([
          eb('p.project_name', 'ilike', searchTerm),
          eb('a.company_name', 'ilike', searchTerm),
          eb('o.order_code', 'ilike', searchTerm),
        ]),
      );
    }

    // Team-scope authorization: DEV_TEAM_LEADER / SEO_TEAM_LEADER views projects of current team members
    if (filter.assignedEmployeeIdIn && filter.assignedEmployeeIdIn.length > 0) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('project_assignments as pa')
            .whereRef('pa.project_id', '=', 'p.id')
            .where('pa.employee_id', 'in', filter.assignedEmployeeIdIn as any)
            .where('pa.is_active', '=', true),
        ),
      );
    } else if (filter.assignedEmployeeIdIn && filter.assignedEmployeeIdIn.length === 0) {
      query = query.where(sql`1 = 0` as any);
    }

    // Object-level authorization: Dev/SEO only view assigned projects
    if (filter.assignedEmployeeIdOnly) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('project_assignments as pa')
            .whereRef('pa.project_id', '=', 'p.id')
            .where('pa.employee_id', '=', filter.assignedEmployeeIdOnly as any)
            .where('pa.is_active', '=', true),
        ),
      );
    }

    const countResult = await query
      .select(sql<number>`count(distinct p.id)`.as('total'))
      .executeTakeFirst();
    const total = Number(countResult?.total || 0);

    const data = await query
      .select([
        'p.id',
        'p.order_item_id',
        'p.project_name',
        'p.status',
        'p.materialized_progress_percent',
        'p.started_at',
        'p.completed_at',
        'p.created_at',
        'p.updated_at',
        'o.order_code',
        'a.company_name',
        's.name as service_name',
      ])
      .orderBy('p.created_at', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();

    // Enrich with active PRIMARY and SUPPORT assignees
    const enrichedData = await Promise.all(
      data.map(async (project) => {
        const assignments = await this.kysely.db
          .selectFrom('project_assignments as pa')
          .innerJoin('employees as e', 'e.id', 'pa.employee_id')
          .select([
            'pa.id',
            'pa.employee_id',
            'e.full_name as employee_name',
            'pa.assignment_type',
            'pa.is_active',
          ])
          .where('pa.project_id', '=', project.id)
          .where('pa.is_active', '=', true)
          .execute();

        const primaryAssignees = assignments.filter((a) => a.assignment_type === 'PRIMARY');
        const supportAssignees = assignments.filter((a) => a.assignment_type === 'SUPPORT');

        return {
          ...project,
          primaryAssignees,
          supportAssignees,
        };
      }),
    );

    return {
      data: enrichedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findProjectById(id: string) {
    const project = await this.kysely.db
      .selectFrom('projects as p')
      .innerJoin('order_items as oi', 'oi.id', 'p.order_item_id')
      .innerJoin('orders as o', 'o.id', 'oi.order_id')
      .innerJoin('accounts as a', 'a.id', 'o.account_id')
      .innerJoin('services as s', 's.id', 'oi.service_id')
      .leftJoin('contacts as c', 'c.id', 'o.primary_contact_id')
      .select([
        'p.id',
        'p.order_item_id',
        'p.project_name',
        'p.status',
        'p.materialized_progress_percent',
        'p.started_at',
        'p.completed_at',
        'p.created_at',
        'p.updated_at',
        'oi.delivery_status as order_item_delivery_status',
        'oi.payment_status as order_item_payment_status',
        'oi.net_service_value',
        'o.id as order_id',
        'o.order_code',
        'a.id as account_id',
        'a.company_name',
        's.id as service_id',
        's.name as service_name',
        'c.id as contact_id',
        'c.full_name as contact_name',
        'c.phone as contact_phone',
        'c.email as contact_email',
      ])
      .where('p.id', '=', id as any)
      .executeTakeFirst();

    if (!project) {
      throw new NotFoundException(`Project [${id}] not found`);
    }

    // Fetch all assignments (active and historical)
    const assignments = await this.kysely.db
      .selectFrom('project_assignments as pa')
      .innerJoin('employees as e', 'e.id', 'pa.employee_id')
      .select([
        'pa.id',
        'pa.employee_id',
        'e.full_name as employee_name',
        'e.employee_code',
        'pa.assignment_type',
        'pa.is_active',
        'pa.assigned_at',
        'pa.unassigned_at',
        'pa.replacement_reason',
      ])
      .where('pa.project_id', '=', id as any)
      .orderBy('pa.assigned_at', 'desc')
      .execute();

    // Fetch milestones and tasks
    const milestones = await this.kysely.db
      .selectFrom('project_milestones')
      .selectAll()
      .where('project_id', '=', id as any)
      .orderBy('sort_order', 'asc')
      .execute();

    const milestoneIds = milestones.map((m) => m.id);
    const tasks = milestoneIds.length > 0
      ? await this.kysely.db
          .selectFrom('project_tasks as pt')
          .leftJoin('employees as e', 'e.id', 'pt.assigned_to_employee_id')
          .select([
            'pt.id',
            'pt.milestone_id',
            'pt.assigned_to_employee_id',
            'e.full_name as assigned_employee_name',
            'pt.title',
            'pt.weight',
            'pt.status',
            'pt.blocked_reason',
            'pt.blocked_since',
            'pt.completed_at',
            'pt.created_at',
          ])
          .where('pt.milestone_id', 'in', milestoneIds)
          .orderBy('pt.created_at', 'asc')
          .execute()
      : [];

    // Fetch acceptance if exists
    const acceptance = await this.kysely.db
      .selectFrom('project_acceptances as pa')
      .innerJoin('contacts as c', 'c.id', 'pa.customer_contact_id')
      .innerJoin('employees as e', 'e.id', 'pa.recorded_by_employee_id')
      .select([
        'pa.id',
        'pa.project_id',
        'pa.customer_contact_id',
        'c.full_name as customer_contact_name',
        'pa.accepted_by_name',
        'pa.accepted_at',
        'pa.evidence_document',
        'e.full_name as recorded_by_name',
        'pa.created_at',
      ])
      .where('pa.project_id', '=', id as any)
      .executeTakeFirst();

    // Fetch dependencies
    const dependencies = await this.kysely.db
      .selectFrom('order_item_dependencies as oid')
      .innerJoin('order_items as prereq', 'prereq.id', 'oid.prerequisite_item_id')
      .innerJoin('services as ps', 'ps.id', 'prereq.service_id')
      .select([
        'oid.id',
        'oid.prerequisite_item_id',
        'ps.name as prerequisite_service_name',
        'oid.required_prerequisite_delivery_status',
        'oid.required_prerequisite_payment_status',
        'prereq.delivery_status as current_prerequisite_delivery_status',
        'prereq.payment_status as current_prerequisite_payment_status',
        'oid.is_unlocked',
      ])
      .where('oid.dependent_item_id', '=', project.order_item_id)
      .execute();

    // Fetch project attachments if any
    const attachments = await this.kysely.db
      .selectFrom('project_attachments as pa')
      .leftJoin('employees as emp', 'emp.id', 'pa.uploaded_by_employee_id')
      .select([
        'pa.id',
        'pa.project_id',
        'pa.file_title',
        'pa.file_url',
        'pa.uploaded_at',
        'emp.full_name as uploaded_by_name',
      ])
      .where('pa.project_id', '=', id as any)
      .orderBy('pa.uploaded_at', 'desc')
      .execute();

    // Audit logs for project
    const auditLogs = await this.kysely.db
      .selectFrom('audit_logs as al')
      .leftJoin('employees as emp', 'emp.id', 'al.actor_employee_id')
      .select([
        'al.id',
        'al.action',
        'al.entity_type',
        'al.entity_id',
        'al.payload_before_sanitized',
        'al.payload_after_sanitized',
        'al.created_at',
        'emp.full_name as actor_name',
      ])
      .where('al.entity_type', '=', 'projects')
      .where('al.entity_id', '=', id as any)
      .orderBy('al.created_at', 'desc')
      .execute();

    return {
      ...project,
      assignments,
      milestones,
      tasks,
      acceptance,
      dependencies,
      attachments: attachments || [],
      auditLogs,
    };
  }

  // --------------------------------------------------
  // TASKS & ACCEPTANCE QUERY METHODS
  // --------------------------------------------------

  async findTasks(filter: {
    page?: number;
    limit?: number;
    status?: string;
    projectId?: string;
    assignedEmployeeIdIn?: string[];
    assignedEmployeeIdOnly?: string;
  }) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 20));
    const offset = (page - 1) * limit;

    let query = this.kysely.db
      .selectFrom('project_tasks as pt')
      .innerJoin('project_milestones as pm', 'pm.id', 'pt.milestone_id')
      .innerJoin('projects as p', 'p.id', 'pm.project_id')
      .leftJoin('employees as e', 'e.id', 'pt.assigned_to_employee_id');

    if (filter.status) {
      query = query.where('pt.status', '=', filter.status as any);
    }

    if (filter.projectId) {
      query = query.where('pm.project_id', '=', filter.projectId as any);
    }

    if (filter.assignedEmployeeIdIn && filter.assignedEmployeeIdIn.length > 0) {
      query = query.where((eb) =>
        eb.or([
          eb('pt.assigned_to_employee_id', 'in', filter.assignedEmployeeIdIn as any),
          eb.exists(
            eb
              .selectFrom('project_assignments as pa')
              .whereRef('pa.project_id', '=', 'pm.project_id')
              .where('pa.employee_id', 'in', filter.assignedEmployeeIdIn as any)
              .where('pa.is_active', '=', true),
          ),
        ]),
      );
    } else if (filter.assignedEmployeeIdIn && filter.assignedEmployeeIdIn.length === 0) {
      query = query.where(sql`1 = 0` as any);
    }

    if (filter.assignedEmployeeIdOnly) {
      query = query.where((eb) =>
        eb.or([
          eb('pt.assigned_to_employee_id', '=', filter.assignedEmployeeIdOnly as any),
          eb.exists(
            eb
              .selectFrom('project_assignments as pa')
              .whereRef('pa.project_id', '=', 'pm.project_id')
              .where('pa.employee_id', '=', filter.assignedEmployeeIdOnly as any)
              .where('pa.is_active', '=', true),
          ),
        ]),
      );
    }

    const countRes = await query
      .select(sql<number>`count(distinct pt.id)`.as('total'))
      .executeTakeFirst();
    const total = Number(countRes?.total || 0);

    const data = await query
      .select([
        'pt.id',
        'pt.milestone_id',
        'pm.project_id',
        'p.project_name',
        'pt.title',
        'pt.weight',
        'pt.status',
        'pt.blocked_reason',
        'pt.blocked_since',
        'pt.completed_at',
        'pt.created_at',
        'pt.assigned_to_employee_id',
        'e.full_name as assigned_employee_name',
      ])
      .orderBy('pt.created_at', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findTaskById(taskId: string) {
    const task = await this.kysely.db
      .selectFrom('project_tasks as pt')
      .innerJoin('project_milestones as pm', 'pm.id', 'pt.milestone_id')
      .innerJoin('projects as p', 'p.id', 'pm.project_id')
      .leftJoin('employees as e', 'e.id', 'pt.assigned_to_employee_id')
      .select([
        'pt.id',
        'pt.milestone_id',
        'pm.project_id',
        'p.project_name',
        'pt.title',
        'pt.weight',
        'pt.status',
        'pt.blocked_reason',
        'pt.blocked_since',
        'pt.completed_at',
        'pt.created_at',
        'pt.assigned_to_employee_id',
        'e.full_name as assigned_employee_name',
      ])
      .where('pt.id', '=', taskId as any)
      .executeTakeFirst();

    if (!task) {
      throw new NotFoundException(`Task [${taskId}] not found`);
    }

    // Get active project assignments to check scope
    const assignments = await this.kysely.db
      .selectFrom('project_assignments as pa')
      .select(['pa.employee_id', 'pa.assignment_type', 'pa.is_active'])
      .where('pa.project_id', '=', task.project_id as any)
      .where('pa.is_active', '=', true)
      .execute();

    return {
      ...task,
      projectAssignments: assignments,
    };
  }

  async findAcceptanceById(acceptanceId: string) {
    const acceptance = await this.kysely.db
      .selectFrom('project_acceptances as pa')
      .innerJoin('projects as p', 'p.id', 'pa.project_id')
      .innerJoin('contacts as c', 'c.id', 'pa.customer_contact_id')
      .innerJoin('employees as e', 'e.id', 'pa.recorded_by_employee_id')
      .select([
        'pa.id',
        'pa.project_id',
        'p.project_name',
        'pa.customer_contact_id',
        'c.full_name as customer_contact_name',
        'pa.accepted_by_name',
        'pa.accepted_at',
        'pa.evidence_document',
        'e.full_name as recorded_by_name',
        'pa.created_at',
      ])
      .where('pa.id', '=', acceptanceId as any)
      .executeTakeFirst();

    if (!acceptance) {
      throw new NotFoundException(`Acceptance [${acceptanceId}] not found`);
    }

    const assignments = await this.kysely.db
      .selectFrom('project_assignments as pa')
      .select(['pa.employee_id', 'pa.assignment_type', 'pa.is_active'])
      .where('pa.project_id', '=', acceptance.project_id as any)
      .where('pa.is_active', '=', true)
      .execute();

    return {
      ...acceptance,
      projectAssignments: assignments,
    };
  }

  async findAcceptanceByProjectId(projectId: string) {
    const acceptance = await this.kysely.db
      .selectFrom('project_acceptances as pa')
      .innerJoin('projects as p', 'p.id', 'pa.project_id')
      .innerJoin('contacts as c', 'c.id', 'pa.customer_contact_id')
      .innerJoin('employees as e', 'e.id', 'pa.recorded_by_employee_id')
      .select([
        'pa.id',
        'pa.project_id',
        'p.project_name',
        'pa.customer_contact_id',
        'c.full_name as customer_contact_name',
        'pa.accepted_by_name',
        'pa.accepted_at',
        'pa.evidence_document',
        'e.full_name as recorded_by_name',
        'pa.created_at',
      ])
      .where('pa.project_id', '=', projectId as any)
      .executeTakeFirst();

    if (!acceptance) {
      throw new NotFoundException(`No acceptance found for project [${projectId}]`);
    }

    const assignments = await this.kysely.db
      .selectFrom('project_assignments as pa')
      .select(['pa.employee_id', 'pa.assignment_type', 'pa.is_active'])
      .where('pa.project_id', '=', projectId as any)
      .where('pa.is_active', '=', true)
      .execute();

    return {
      ...acceptance,
      projectAssignments: assignments,
    };
  }
}
