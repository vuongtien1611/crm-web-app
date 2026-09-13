import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { LeadsService } from './leads.service';
import { AcquisitionService } from '../acquisition/acquisition.service';
import { SalesActivitiesService } from '../sales-activities/sales-activities.service';
import { KyselyService } from '../../database/kysely.service';
import { LeadQuality } from './dto/update-lead-quality.dto';
import { LeadStatus } from './dto/update-lead-status.dto';
import { ActivityType } from '../sales-activities/dto/create-sales-activity.dto';

async function runLeadIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING LEAD & ACQUISITION INTEGRATION TEST SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const leadsService = app.get(LeadsService);
  const acquisitionService = app.get(AcquisitionService);
  const salesActivitiesService = app.get(SalesActivitiesService);
  const kyselyService = app.get(KyselyService);
  const db = kyselyService.db;

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passCount++;
    } else {
      console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failCount++;
    }
  }

  // Fixtures Setup
  const pos = await db.selectFrom('positions').select('id').executeTakeFirst();
  if (!pos) throw new Error('No positions found in DB');

  // Create test employee 1 (Sale)
  const empCode1 = `EMP-TEST-SALE-${Date.now()}`;
  const [employee1] = await db
    .insertInto('employees')
    .values({
      employee_code: empCode1,
      full_name: 'Test Sale Representative',
      position_id: pos.id,
      status: 'ACTIVE',
    })
    .returningAll()
    .execute();

  // Create test employee 2 (Content Creator)
  const empCode2 = `EMP-TEST-MARKETING-${Date.now()}`;
  const [employee2] = await db
    .insertInto('employees')
    .values({
      employee_code: empCode2,
      full_name: 'Test Marketing Specialist',
      position_id: pos.id,
      status: 'ACTIVE',
    })
    .returningAll()
    .execute();

  // Create test Platform & Channel
  const platformCode = `FB-${Date.now()}`;
  const platform = await acquisitionService.createPlatform({
    code: platformCode,
    name: 'Facebook Ads',
  });

  const channelCode = `INBOUND-${Date.now()}`;
  const channel = await acquisitionService.createChannel({
    code: channelCode,
    name: 'Inbound Form',
  });

  // Create test Sales Content
  const salesContent = await acquisitionService.createSalesContent({
    contentTitle: 'Landing Page SEO Audit 2026',
    creatorEmployeeId: String(employee2.id),
    platformId: String(platform.id),
    channelId: String(channel.id),
    url: 'https://crm.example.com/landing-seo',
  });

  let createdLead1: any;
  let createdLead2: any;

  try {
    // LEAD-01: Create Organic Lead with Attribution
    try {
      createdLead1 = await leadsService.createLead({
        fullName: 'Organic Customer Test',
        phone: '0987654321',
        email: 'organic@customer.com',
        platformId: String(platform.id),
        channelId: String(channel.id),
        salesContentId: String(salesContent.id),
        creatorEmployeeId: String(employee2.id),
        assignedSaleId: String(employee1.id),
        landingPage: 'https://crm.example.com/landing-seo',
        utmSource: 'facebook',
        utmMedium: 'cpc',
        utmCampaign: 'summer_promo',
      });
      assert(
        createdLead1.quality === 'UNCLASSIFIED' &&
          createdLead1.status === 'NEW' &&
          String(createdLead1.platform_id) === String(platform.id),
        'LEAD-01: Create Organic Lead with attribution',
      );
    } catch (e: any) {
      assert(false, 'LEAD-01: Create Organic Lead with attribution', e.message);
    }

    // LEAD-02: Create Manual Lead
    try {
      createdLead2 = await leadsService.createLead({
        fullName: 'Manual Customer Test',
        phone: '0912345678',
        email: 'manual@customer.com',
        assignedSaleId: String(employee1.id),
      });
      assert(
        createdLead2.quality === 'UNCLASSIFIED' &&
          createdLead2.status === 'NEW' &&
          createdLead2.platform_id === null,
        'LEAD-02: Create Manual Lead',
      );
    } catch (e: any) {
      assert(false, 'LEAD-02: Create Manual Lead', e.message);
    }

    // LEAD-03: Qualify Lead to NOT_POTENTIAL without reason fails
    try {
      await leadsService.qualifyLead(String(createdLead1.id), {
        quality: LeadQuality.NOT_POTENTIAL,
        notPotentialReason: '',
      });
      assert(false, 'LEAD-03: Qualify NOT_POTENTIAL without reason blocked', 'Expected BadRequestException');
    } catch (e: any) {
      assert(
        e.status === 400 || e.name === 'BadRequestException' || e.message.includes('required'),
        'LEAD-03: Qualify NOT_POTENTIAL without reason blocked',
      );
    }

    // LEAD-04: Qualify Lead to NOT_POTENTIAL with reason succeeds
    try {
      const qLead = await leadsService.qualifyLead(String(createdLead2.id), {
        quality: LeadQuality.NOT_POTENTIAL,
        notPotentialReason: 'Wrong budget expectation',
      });
      assert(
        qLead.quality === 'NOT_POTENTIAL' && qLead.not_potential_reason === 'Wrong budget expectation',
        'LEAD-04: Qualify NOT_POTENTIAL with reason',
      );
    } catch (e: any) {
      assert(false, 'LEAD-04: Qualify NOT_POTENTIAL with reason', e.message);
    }

    // LEAD-05: Qualify Lead to POTENTIAL succeeds
    try {
      const qLead = await leadsService.qualifyLead(String(createdLead1.id), {
        quality: LeadQuality.POTENTIAL,
      });
      assert(qLead.quality === 'POTENTIAL', 'LEAD-05: Qualify POTENTIAL');
    } catch (e: any) {
      assert(false, 'LEAD-05: Qualify POTENTIAL', e.message);
    }

    // LEAD-06: Update Lead Status to CALLED & CONSULTED
    try {
      await leadsService.updateStatus(String(createdLead1.id), { status: LeadStatus.CALLED });
      const updated = await leadsService.updateStatus(String(createdLead1.id), { status: LeadStatus.CONSULTED });
      assert(updated.status === 'CONSULTED', 'LEAD-06: Update Lead status to CONSULTED');
    } catch (e: any) {
      assert(false, 'LEAD-06: Update Lead status to CONSULTED', e.message);
    }

    // LEAD-07: Assign Lead to another Sale employee
    try {
      const reassigned = await leadsService.assignLead(
        String(createdLead1.id),
        { toSaleId: String(employee2.id), reason: 'Reassigned for specialized SEO consultation' },
        String(employee1.id),
      );
      const detail = await leadsService.findLeadById(String(createdLead1.id));
      assert(
        String(reassigned.assigned_sale_id) === String(employee2.id) &&
          detail.assignmentHistory.length > 0,
        'LEAD-07: Assign Lead with history logging',
      );
    } catch (e: any) {
      assert(false, 'LEAD-07: Assign Lead with history logging', e.message);
    }

    // LEAD-08: Log Sales Activity for Lead
    try {
      const activity = await salesActivitiesService.createActivity(String(employee2.id), {
        leadId: String(createdLead1.id),
        activityType: ActivityType.CALL,
        resultNote: 'Discussed project scope with client. Next follow-up scheduled.',
        nextFollowUpAt: new Date(Date.now() + 86400000).toISOString(),
      });
      assert(
        String(activity.lead_id) === String(createdLead1.id) && activity.activity_type === 'CALL',
        'LEAD-08: Log Sales Activity',
      );
    } catch (e: any) {
      assert(false, 'LEAD-08: Log Sales Activity', e.message);
    }

    // LEAD-09: Mark FAILED without reason fails
    try {
      await leadsService.markFailed(String(createdLead1.id), { failedReason: '' });
      assert(false, 'LEAD-09: Mark FAILED without reason blocked', 'Expected BadRequestException');
    } catch (e: any) {
      assert(
        e.status === 400 || e.name === 'BadRequestException' || e.message.includes('required'),
        'LEAD-09: Mark FAILED without reason blocked',
      );
    }

    // LEAD-10: Convert Lead to Deal when quality != POTENTIAL fails
    try {
      // createdLead2 is NOT_POTENTIAL
      await leadsService.convertToDeal(String(createdLead2.id), {
        companyName: 'Failed Company Test',
        contactName: 'Contact Test',
        dealName: 'Invalid Deal Test',
      });
      assert(false, 'LEAD-10: Convert non-POTENTIAL lead blocked', 'Expected BadRequestException');
    } catch (e: any) {
      assert(
        e.status === 400 || e.name === 'BadRequestException' || e.message.includes('POTENTIAL'),
        'LEAD-10: Convert non-POTENTIAL lead blocked',
      );
    }

    // LEAD-11: Convert Lead to Deal when quality = POTENTIAL succeeds (Boundary Test)
    try {
      const convertRes = await leadsService.convertToDeal(
        String(createdLead1.id),
        {
          companyName: 'Acme High-Tech Corp',
          taxCode: `TAX-${Date.now()}`,
          contactName: 'Organic Customer Test',
          contactPhone: '0987654321',
          contactEmail: 'organic@customer.com',
          dealName: 'Acme CRM SEO Package Deal',
          expectedValue: 50000000,
        },
        String(employee2.id),
      );

      const leadAfter = await leadsService.findLeadById(String(createdLead1.id));

      assert(
        convertRes.deal &&
          convertRes.deal.status === 'OPEN' &&
          convertRes.account &&
          leadAfter.status === 'CONVERTED',
        'LEAD-11: Convert Lead to Deal boundary success',
      );
    } catch (e: any) {
      assert(false, 'LEAD-11: Convert Lead to Deal boundary success', e.message);
    }
  } finally {
    // Cleanup fixtures
    if (createdLead1?.id) {
      await db.deleteFrom('deals').where('lead_id', '=', createdLead1.id).execute();
      await db.deleteFrom('sales_activities').where('lead_id', '=', createdLead1.id).execute();
      await db.deleteFrom('lead_assignment_history').where('lead_id', '=', createdLead1.id).execute();
      await db.deleteFrom('leads').where('id', '=', createdLead1.id).execute();
    }
    if (createdLead2?.id) {
      await db.deleteFrom('sales_activities').where('lead_id', '=', createdLead2.id).execute();
      await db.deleteFrom('lead_assignment_history').where('lead_id', '=', createdLead2.id).execute();
      await db.deleteFrom('leads').where('id', '=', createdLead2.id).execute();
    }
    if (salesContent?.id) {
      await db.deleteFrom('sales_contents').where('id', '=', salesContent.id as any).execute();
    }
    if (platform?.id) {
      await db.deleteFrom('platforms').where('id', '=', platform.id as any).execute();
    }
    if (channel?.id) {
      await db.deleteFrom('channels').where('id', '=', channel.id as any).execute();
    }
    await db.deleteFrom('employees').where('id', 'in', [employee1.id, employee2.id] as any).execute();
  }

  console.log('==================================================');
  console.log(`LEAD INTEGRATION TEST RESULT: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('==================================================');

  await app.close();
  if (failCount > 0) {
    process.exit(1);
  }
}

runLeadIntegrationTests().catch((err) => {
  console.error('❌ Lead Integration Test Suite Error:', err);
  process.exit(1);
});
