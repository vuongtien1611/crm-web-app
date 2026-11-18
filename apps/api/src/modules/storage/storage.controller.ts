import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
  Res,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { StorageService } from './storage.service';
import { StorageEntityType } from './storage.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UploadFileDto {
  @IsString()
  @IsOptional()
  entityType?: StorageEntityType;

  @IsOptional()
  entityId?: string | number;

  @IsString()
  @IsOptional()
  filename?: string;

  @IsString()
  @IsOptional()
  fileContentBase64?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;
}

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly kysely: KyselyService,
  ) {}

  /**
   * ST-01: Authenticated File Upload Endpoint.
   * Supports multipart/form-data or legacy base64 payload.
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  async uploadFile(
    @Req() req: FastifyRequest & { user: any },
    @Body() body: UploadFileDto,
  ) {
    let buffer: Buffer | undefined;
    let filename = body?.filename;
    let entityType = body?.entityType;
    let entityId = body?.entityId;
    let claimedMimeType = body?.mimeType;

    // Check if multipart form data was sent
    if ((req as any).isMultipart && (req as any).isMultipart()) {
      try {
        const parts = (req as any).parts();
        for await (const part of parts) {
          if (part.type === 'file') {
            if ((part as any).file?.truncated) {
              throw new BadRequestException('Kích thước tệp vượt quá giới hạn tối đa cho phép (10MB)');
            }
            buffer = await part.toBuffer();
            filename = part.filename;
            claimedMimeType = part.mimetype;
          } else {
            if (part.fieldname === 'entityType') entityType = part.value as any;
            if (part.fieldname === 'entityId') entityId = part.value as any;
            if (part.fieldname === 'filename' && !filename) filename = part.value as string;
            if (part.fieldname === 'mimeType' && !claimedMimeType) claimedMimeType = part.value as string;
          }
        }
      } catch (err: any) {
        if (
          err?.code === 'FST_REQ_FILE_TOO_LARGE' ||
          err?.code === 'FST_FILES_LIMIT' ||
          err?.message?.includes('File too large') ||
          err?.status === 413
        ) {
          throw new BadRequestException('Kích thước tệp vượt quá giới hạn tối đa cho phép (10MB)');
        }
        throw err;
      }

      if (!buffer) {
        throw new BadRequestException('Không tìm thấy tệp tải lên trong form data');
      }
    } else if (body?.fileContentBase64) {
      buffer = Buffer.from(body.fileContentBase64, 'base64');
    } else {
      throw new BadRequestException('Vui lòng cung cấp fileContentBase64 hoặc multipart file');
    }

    if (!entityType) {
      throw new BadRequestException('entityType là bắt buộc');
    }
    if (!entityId) {
      throw new BadRequestException('entityId là bắt buộc');
    }
    if (!filename) {
      throw new BadRequestException('filename là bắt buộc');
    }

    return await this.storageService.uploadFile({
      entityType,
      entityId,
      filename,
      buffer,
      claimedMimeType,
    });
  }

  /**
   * ST-05 & ST-06: Payment Proof Download (Strict Object Authorization).
   */
  @Get('payments/:id/proof')
  @UseGuards(JwtAuthGuard)
  async getPaymentProof(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const actor = req.user;
    const db = this.kysely.db;

    const payment = await db
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!payment) {
      throw new NotFoundException(`Payment #${id} not found`);
    }

    // Reuse Payment Object Authorization
    const roles: string[] = actor.roles || [];
    const isElevated = roles.includes('ADMIN') || roles.includes('BOSS') || roles.includes('ACCOUNTANT');
    const isCreator = actor.employeeId && String(payment.created_by_employee_id) === String(actor.employeeId);

    if (!isElevated && !isCreator) {
      throw new ForbiddenException('Bạn không có quyền truy cập chứng từ của khoản thanh toán này');
    }

    if (!payment.evidence_url) {
      throw new NotFoundException('Khoản thanh toán này chưa có chứng từ');
    }

    const downloadUrl = await this.storageService.getSignedUrl(payment.evidence_url);

    return {
      paymentId: String(payment.id),
      objectKey: payment.evidence_url,
      downloadUrl,
    };
  }

  /**
   * ST-07: Project Acceptance Evidence Download (Strict Project Object Scoping).
   */
  @Get('projects/:id/acceptance-evidence')
  @UseGuards(JwtAuthGuard)
  async getProjectAcceptanceEvidence(
    @Param('id') projectId: string,
    @Req() req: any,
  ) {
    await this.assertProjectAccess(projectId, req.user);

    const db = this.kysely.db;
    const acceptance = await db
      .selectFrom('project_acceptances')
      .selectAll()
      .where('project_id', '=', projectId as any)
      .executeTakeFirst();

    if (!acceptance || !acceptance.evidence_document) {
      throw new NotFoundException(`Acceptance evidence for project #${projectId} not found`);
    }

    const downloadUrl = await this.storageService.getSignedUrl(acceptance.evidence_document);

    return {
      projectId,
      objectKey: acceptance.evidence_document,
      downloadUrl,
    };
  }

  /**
   * Project Attachment Download (Strict Project Object Scoping).
   */
  @Get('projects/:id/attachments/:attachmentId')
  @UseGuards(JwtAuthGuard)
  async getProjectAttachment(
    @Param('id') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: any,
  ) {
    await this.assertProjectAccess(projectId, req.user);

    const db = this.kysely.db;
    const attachment = await db
      .selectFrom('project_attachments')
      .selectAll()
      .where('id', '=', attachmentId as any)
      .where('project_id', '=', projectId as any)
      .executeTakeFirst();

    if (!attachment || !attachment.file_url) {
      throw new NotFoundException(`Attachment #${attachmentId} not found`);
    }

    const downloadUrl = await this.storageService.getSignedUrl(attachment.file_url);

    return {
      projectId,
      attachmentId: String(attachment.id),
      objectKey: attachment.file_url,
      title: attachment.file_title,
      downloadUrl,
    };
  }

  /**
   * ST-08: Subscription Service Period Acceptance Evidence (Strict Phase J Scope).
   */
  @Get('subscriptions/periods/:periodId/acceptance-evidence')
  @UseGuards(JwtAuthGuard)
  async getServicePeriodAcceptanceEvidence(
    @Param('periodId') periodId: string,
    @Req() req: any,
  ) {
    const actor = req.user;
    const roles: string[] = actor.roles || [];
    const db = this.kysely.db;

    const period = await db
      .selectFrom('service_periods')
      .selectAll()
      .where('id', '=', periodId as any)
      .executeTakeFirst();

    if (!period) {
      throw new NotFoundException(`Service period #${periodId} not found`);
    }

    const isElevated = roles.includes('ADMIN') || roles.includes('BOSS');

    if (!isElevated) {
      if (roles.includes('ACCOUNTANT')) {
        // Must have financial obligation
        const hasApprovedPlan = await db
          .selectFrom('subscriptions as s')
          .innerJoin('order_item_payment_plans as oipp', 'oipp.order_item_id', 's.order_item_id')
          .select('oipp.id')
          .where('s.id', '=', period.subscription_id)
          .where('oipp.status', '=', 'APPROVED')
          .executeTakeFirst();

        const hasAllocation = await db
          .selectFrom('payment_allocations as pa')
          .innerJoin('payment_installments as pi', 'pi.id', 'pa.installment_id')
          .select('pa.id')
          .where('pi.service_period_id', '=', period.id)
          .executeTakeFirst();

        if (!hasApprovedPlan && !hasAllocation) {
          throw new ForbiddenException('Kế toán chỉ được xem Subscription khi đã phát sinh nghĩa vụ tài chính');
        }
      } else if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        // Tech Leader: check led team active assignment
        const ledTeam = await db
          .selectFrom('team_memberships')
          .select('team_id')
          .where('employee_id', '=', actor.employeeId as any)
          .where('is_leader', '=', true)
          .where(sql`effective_range @> NOW()` as any)
          .executeTakeFirst();

        if (!ledTeam) {
          throw new ForbiddenException('Chỉ xem được kỳ dịch vụ liên quan tới nhóm phụ trách');
        }

        const teamMembers = await db
          .selectFrom('team_memberships')
          .select('employee_id')
          .where('team_id', '=', ledTeam.team_id)
          .where(sql`effective_range @> NOW()` as any)
          .execute();
        const teamEmpIds = teamMembers.map((m) => String(m.employee_id));

        const hasAssignment = await db
          .selectFrom('service_period_assignments')
          .select('id')
          .where('service_period_id', '=', period.id)
          .where('employee_id', 'in', teamEmpIds as any[])
          .where('is_active', '=', true)
          .executeTakeFirst();

        if (!hasAssignment) {
          throw new ForbiddenException('Chỉ xem được kỳ dịch vụ do thành viên nhóm phụ trách');
        }
      } else {
        // Normal employee: must be directly assigned
        const isAssigned = await db
          .selectFrom('service_period_assignments')
          .select('id')
          .where('service_period_id', '=', period.id)
          .where('employee_id', '=', actor.employeeId as any)
          .where('is_active', '=', true)
          .executeTakeFirst();

        if (!isAssigned) {
          throw new ForbiddenException('Bạn không có quyền truy cập tài liệu nghiệm thu kỳ dịch vụ này');
        }
      }
    }

    const acceptance = await db
      .selectFrom('service_period_acceptances')
      .selectAll()
      .where('service_period_id', '=', periodId as any)
      .executeTakeFirst();

    if (!acceptance || !acceptance.evidence_document) {
      throw new NotFoundException(`Acceptance evidence for service period #${periodId} not found`);
    }

    const downloadUrl = await this.storageService.getSignedUrl(acceptance.evidence_document);

    return {
      periodId,
      objectKey: acceptance.evidence_document,
      downloadUrl,
    };
  }

  /**
   * Helper: Assert project access for actor.
   */
  private async assertProjectAccess(projectId: string, actor: any): Promise<void> {
    const roles: string[] = actor.roles || [];
    if (roles.includes('ADMIN') || roles.includes('BOSS')) {
      return;
    }

    const db = this.kysely.db;
    const project = await db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', projectId as any)
      .executeTakeFirst();

    if (!project) {
      throw new NotFoundException(`Project #${projectId} not found`);
    }

    // Check direct assignment
    const directAssignment = await db
      .selectFrom('project_assignments')
      .select('id')
      .where('project_id', '=', project.id)
      .where('employee_id', '=', actor.employeeId as any)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (directAssignment) {
      return;
    }

    // Check team leader assignment
    if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
      const ledTeam = await db
        .selectFrom('team_memberships')
        .select('team_id')
        .where('employee_id', '=', actor.employeeId as any)
        .where('is_leader', '=', true)
        .where(sql`effective_range @> NOW()` as any)
        .executeTakeFirst();

      if (ledTeam) {
        const teamMembers = await db
          .selectFrom('team_memberships')
          .select('employee_id')
          .where('team_id', '=', ledTeam.team_id)
          .where(sql`effective_range @> NOW()` as any)
          .execute();
        const teamEmpIds = teamMembers.map((m) => String(m.employee_id));

        const teamAssignment = await db
          .selectFrom('project_assignments')
          .select('id')
          .where('project_id', '=', project.id)
          .where('employee_id', 'in', teamEmpIds as any[])
          .where('is_active', '=', true)
          .executeTakeFirst();

        if (teamAssignment) {
          return;
        }
      }
    }

    throw new ForbiddenException('Bạn không có quyền truy cập tệp của dự án này');
  }

  /**
   * Local / Proxy download endpoint for local development and test retrieval.
   */
  @Get('raw/*')
  async serveRawFile(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const rawPath = (req.params as any)['*'];
    if (!rawPath) {
      throw new NotFoundException('Missing file path');
    }

    const query = req.query as { expires?: string; signature?: string };
    if (
      typeof query.expires !== 'string' ||
      typeof query.signature !== 'string' ||
      !this.storageService.isLocalSignedUrlValid(rawPath, query.expires, query.signature)
    ) {
      throw new ForbiddenException('Invalid or expired file URL');
    }

    try {
      const file = await this.storageService.getFileBuffer(rawPath);
      res.header('Content-Type', file.mimeType);
      res.header('Content-Length', file.size);
      return res.send(file.buffer);
    } catch (e: any) {
      throw new NotFoundException(`File not found: ${rawPath}`);
    }
  }
}
