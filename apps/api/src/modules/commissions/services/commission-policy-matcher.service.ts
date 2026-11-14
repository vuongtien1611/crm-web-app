import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { KyselyService } from '../../../database/kysely.service';

export interface PolicyMatchCriteria {
  policyType: 'SALE' | 'PROJECT_DELIVERY' | 'TEAM_OVERRIDE';
  serviceId?: string | number | null;
  positionId?: string | number | null;
  assigneeCount?: number | null;
  effectiveDate?: Date;
}

@Injectable()
export class CommissionPolicyMatcherService {
  constructor(private readonly kysely: KyselyService) {}

  async matchPolicy(criteria: PolicyMatchCriteria, trx?: any) {
    const db = trx || this.kysely.db;
    const targetDate = criteria.effectiveDate || new Date();

    const candidates = await db
      .selectFrom('commission_policies')
      .selectAll()
      .where('policy_type', '=', criteria.policyType)
      .execute();

    if (candidates.length === 0) {
      throw new NotFoundException(`No commission policy found for type ${criteria.policyType}`);
    }

    // Filter by effective date range
    const validByDate = candidates.filter((p: any) => {
      if (!p.effective_range) return true;
      const rangeStr = String(p.effective_range);

      const match = rangeStr.match(/([\[\(])"?([^",\)]*)"?\s*,\s*"?([^"\)]*)"?([\)\ authentication]?)/);
      if (!match) return true;

      const lowerStr = match[2]?.trim();
      const upperStr = match[3]?.trim();

      const lower = lowerStr && lowerStr !== 'empty' ? new Date(lowerStr) : null;
      const upper = upperStr && upperStr !== 'infinity' && upperStr !== '' ? new Date(upperStr) : null;

      if (lower && targetDate < lower) return false;
      if (upper && targetDate >= upper) return false;

      return true;
    });

    if (validByDate.length === 0) {
      throw new NotFoundException(`No effective commission policy found for date ${targetDate.toISOString()}`);
    }

    let maxScore = -1;
    let bestMatches: typeof candidates = [];

    for (const p of validByDate) {
      let score = 0;
      let isCompatible = true;

      // Service matching
      if (p.service_id !== null && p.service_id !== undefined) {
        if (criteria.serviceId && String(p.service_id) === String(criteria.serviceId)) {
          score += 4;
        } else {
          isCompatible = false;
        }
      }

      // Position matching
      if (p.position_id !== null && p.position_id !== undefined) {
        if (criteria.positionId && String(p.position_id) === String(criteria.positionId)) {
          score += 2;
        } else {
          isCompatible = false;
        }
      }

      // Assignee count matching
      if (p.assignee_count !== null && p.assignee_count !== undefined) {
        if (criteria.assigneeCount !== undefined && criteria.assigneeCount !== null && Number(p.assignee_count) === Number(criteria.assigneeCount)) {
          score += 1;
        } else {
          isCompatible = false;
        }
      }

      if (!isCompatible) continue;

      if (score > maxScore) {
        maxScore = score;
        bestMatches = [p];
      } else if (score === maxScore) {
        bestMatches.push(p);
      }
    }

    if (bestMatches.length === 0) {
      throw new NotFoundException(`No matching commission policy found for criteria: ${JSON.stringify(criteria)}`);
    }

    if (bestMatches.length > 1) {
      throw new BadRequestException(
        `Ambiguous policy match: multiple policies with equal specificity (${maxScore}) matched for criteria`,
      );
    }

    return bestMatches[0];
  }
}
