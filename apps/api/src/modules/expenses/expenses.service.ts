import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ProcessPayrollExpenseDto } from './dto/process-payroll-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly kysely: KyselyService) {}

  // --------------------------------------------------
  // CREATE MANUAL EXPENSE
  // Validates category, positive amount, and logs audit trace
  // --------------------------------------------------
  async createManualExpense(dto: CreateExpenseDto, actorEmployeeId: string) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Expense amount must be greater than 0');
    }

    const category = await this.kysely.db
      .selectFrom('expense_categories')
      .selectAll()
      .where('id', '=', dto.category_id as any)
      .executeTakeFirst();

    if (!category) {
      throw new NotFoundException(`Expense category #${dto.category_id} not found`);
    }

    const [expense] = await this.kysely.db
      .insertInto('expenses')
      .values({
        category_id: category.id,
        amount: dto.amount as any,
        expense_date: dto.expense_date as any,
        created_by_employee_id: actorEmployeeId as any,
        approved_by_employee_id: (dto.approved_by_employee_id || null) as any,
        source_type: dto.source_type,
        source_payroll_period_id: null,
        note: dto.note || null,
      })
      .returningAll()
      .execute();

    // Audit Logging
    await this.kysely.db
      .insertInto('audit_logs')
      .values({
        actor_employee_id: actorEmployeeId as any,
        action: 'EXPENSE_CREATE',
        entity_type: 'EXPENSE',
        entity_id: expense.id,
        payload_before_sanitized: null,
        payload_after_sanitized: JSON.stringify({
          amount: expense.amount,
          source_type: expense.source_type,
          category_id: expense.category_id,
        }),
      })
      .execute();

    return expense;
  }

  // --------------------------------------------------
  // PROCESS PAYROLL EXPENSE (PAYROLL -> EXPENSE DEDUPLICATION)
  // Atomic, transactional, idempotent creation of aggregated salary expense
  // --------------------------------------------------
  async processPayrollExpense(dto: ProcessPayrollExpenseDto, actorEmployeeId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      // 1. Lock Payroll Period FOR UPDATE
      const period = await trx
        .selectFrom('payroll_periods')
        .selectAll()
        .where('id', '=', dto.payroll_period_id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!period) {
        throw new NotFoundException(`Payroll period #${dto.payroll_period_id} not found`);
      }

      if (period.status !== 'LOCKED') {
        throw new BadRequestException(
          `Cannot process expense for payroll period #${dto.payroll_period_id} with status '${period.status}'. Period must be LOCKED.`,
        );
      }

      // 2. Check for existing canonical Payroll Expense (Idempotency)
      const existingExpense = await trx
        .selectFrom('expenses')
        .selectAll()
        .where('source_payroll_period_id', '=', period.id)
        .where('source_type', '=', 'PAYROLL')
        .executeTakeFirst();

      if (existingExpense) {
        return existingExpense;
      }

      // 3. Find SALARY_PAYROLL expense category
      const salaryCategory = await trx
        .selectFrom('expense_categories')
        .selectAll()
        .where('code', '=', 'SALARY_PAYROLL')
        .executeTakeFirst();

      if (!salaryCategory) {
        throw new NotFoundException(`Default 'SALARY_PAYROLL' expense category not found in system seed`);
      }

      // 4. Calculate canonical payable amount (SUM of net_salary_amount)
      const sumResult = await trx
        .selectFrom('payrolls')
        .where('payroll_period_id', '=', period.id)
        .select((eb) => eb.fn.sum<number>('net_salary_amount').as('totalNetSalary'))
        .executeTakeFirst();

      const totalAmount = Number(sumResult?.totalNetSalary || 0);
      if (totalAmount <= 0) {
        throw new BadRequestException(
          `Cannot process zero/negative salary expense for locked payroll period #${dto.payroll_period_id}`,
        );
      }

      // 5. Insert canonical Expense with database deduplication fallback
      try {
        const expenseDate = period.locked_at
          ? new Date(period.locked_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        const [createdExpense] = await trx
          .insertInto('expenses')
          .values({
            category_id: salaryCategory.id,
            amount: totalAmount as any,
            expense_date: expenseDate as any,
            created_by_employee_id: actorEmployeeId as any,
            approved_by_employee_id: (period.locked_by_employee_id || actorEmployeeId) as any,
            source_type: 'PAYROLL',
            source_payroll_period_id: period.id,
            note: dto.note || `Canonical Payout Expense for Locked Payroll Period [${period.period_key}]`,
          })
          .returningAll()
          .execute();

        // 6. Write Audit Log
        await trx
          .insertInto('audit_logs')
          .values({
            actor_employee_id: actorEmployeeId as any,
            action: 'EXPENSE_PAYROLL_PROCESS',
            entity_type: 'EXPENSE',
            entity_id: createdExpense.id,
            payload_before_sanitized: null,
            payload_after_sanitized: JSON.stringify({
              source_payroll_period_id: period.id,
              period_key: period.period_key,
              amount: totalAmount,
            }),
          })
          .execute();

        return createdExpense;
      } catch (err: any) {
        // PG unique constraint violation (23505) on idx_payroll_expense_dedup
        if (err.code === '23505' || err.message?.includes('idx_payroll_expense_dedup')) {
          const canonical = await trx
            .selectFrom('expenses')
            .selectAll()
            .where('source_payroll_period_id', '=', period.id)
            .where('source_type', '=', 'PAYROLL')
            .executeTakeFirst();

          if (canonical) {
            return canonical;
          }
        }
        throw err;
      }
    });
  }

  // --------------------------------------------------
  // READ METHODS
  // --------------------------------------------------
  async findAll(query: { page?: number; limit?: number; sourceType?: string; categoryId?: string }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    let baseQuery = this.kysely.db
      .selectFrom('expenses as e')
      .innerJoin('expense_categories as ec', 'ec.id', 'e.category_id')
      .select([
        'e.id',
        'e.category_id',
        'ec.code as category_code',
        'ec.name as category_name',
        'e.amount',
        'e.expense_date',
        'e.source_type',
        'e.source_payroll_period_id',
        'e.created_by_employee_id',
        'e.approved_by_employee_id',
        'e.note',
        'e.created_at',
      ]);

    if (query.sourceType) {
      baseQuery = baseQuery.where('e.source_type', '=', query.sourceType as any);
    }

    if (query.categoryId) {
      baseQuery = baseQuery.where('e.category_id', '=', query.categoryId as any);
    }

    const items = await baseQuery
      .orderBy('e.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const countRes = await this.kysely.db
      .selectFrom('expenses')
      .select((eb) => eb.fn.count<number>('id').as('total'))
      .executeTakeFirst();

    return {
      data: items,
      meta: {
        page,
        limit,
        total: Number(countRes?.total || 0),
      },
    };
  }

  async getCategories() {
    return await this.kysely.db
      .selectFrom('expense_categories')
      .selectAll()
      .orderBy('id', 'asc')
      .execute();
  }

  async findById(id: string) {
    const expense = await this.kysely.db
      .selectFrom('expenses as e')
      .innerJoin('expense_categories as ec', 'ec.id', 'e.category_id')
      .where('e.id', '=', id as any)
      .select([
        'e.id',
        'e.category_id',
        'ec.code as category_code',
        'ec.name as category_name',
        'e.amount',
        'e.expense_date',
        'e.source_type',
        'e.source_payroll_period_id',
        'e.created_by_employee_id',
        'e.approved_by_employee_id',
        'e.note',
        'e.created_at',
      ])
      .executeTakeFirst();

    if (!expense) {
      throw new NotFoundException(`Expense #${id} not found`);
    }

    return expense;
  }
}
