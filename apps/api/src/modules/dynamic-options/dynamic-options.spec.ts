import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { DynamicOptionsService } from './dynamic-options.service';
import { KyselyService } from '../../database/kysely.service';
import { BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';

async function runDynamicOptionsIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING DYNAMIC OPTIONS INTEGRATION TEST SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  const dynamicOptionsService = app.get(DynamicOptionsService);
  const kysely = app.get(KyselyService);

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, failureReason?: string) => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${failureReason || 'Assertion failed'}`);
      failed++;
    }
  };

  try {
    const pos = await kysely.db.selectFrom('positions').select('id').executeTakeFirstOrThrow();

    // Create 2 test employees
    const [emp1] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `DYN_EMP1_${Date.now()}`,
        full_name: 'Employee One',
        position_id: pos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [emp2] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `DYN_EMP2_${Date.now()}`,
        full_name: 'Employee Two',
        position_id: pos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const testFieldKey = `test_field_${Date.now()}`;

    // 1. Initial empty check
    const initialList = await dynamicOptionsService.getOptions({ fieldKey: testFieldKey });
    assert(initialList.length === 0, 'Initial dynamic options list is empty');

    // 2. Record first option by emp1
    const opt1 = await dynamicOptionsService.recordOptionUse(
      testFieldKey,
      'Thiết kế giao diện UI/UX',
      emp1.id,
    );
    assert(opt1.value === 'Thiết kế giao diện UI/UX', 'Option value saved correctly');
    assert(opt1.usage_count === 1, 'Initial usage_count is 1');
    assert(opt1.field_key === testFieldKey, 'Field key matches');

    // 3. Multi-user sharing: emp2 can see and retrieve opt1
    const listEmp2 = await dynamicOptionsService.getOptions({ fieldKey: testFieldKey });
    assert(listEmp2.length === 1 && listEmp2[0].value === 'Thiết kế giao diện UI/UX', 'Multi-user sharing: emp2 sees emp1 option');

    // 4. De-duplication on different case and leading/trailing whitespace
    // Wait 50ms so timestamp increases
    await new Promise((r) => setTimeout(r, 50));
    const opt1Reused = await dynamicOptionsService.recordOptionUse(
      testFieldKey,
      '   thiết kế   giao diện ui/ux   ',
      emp2.id,
    );
    assert(opt1Reused.id === opt1.id, 'Duplicate normalized value does not create new row');
    assert(opt1Reused.usage_count === 2, 'Usage count incremented to 2');
    assert(new Date(opt1Reused.last_used_at).getTime() >= new Date(opt1.last_used_at).getTime(), 'last_used_at updated');

    // Verify DB count
    const dbCount = await kysely.db
      .selectFrom('dynamic_options')
      .where('field_key', '=', testFieldKey)
      .select(kysely.db.fn.count<string>('id').as('cnt'))
      .executeTakeFirstOrThrow();
    assert(Number(dbCount.cnt) === 1, 'DB strictly has only 1 row after de-duplication');

    // 5. Add second and third options to test recency & usage sorting
    await new Promise((r) => setTimeout(r, 50));
    const opt2 = await dynamicOptionsService.recordOptionUse(
      testFieldKey,
      'Xây dựng API Backend',
      emp1.id,
    );
    assert(opt2.usage_count === 1, 'Second option created with usage_count 1');

    await new Promise((r) => setTimeout(r, 50));
    const opt3 = await dynamicOptionsService.recordOptionUse(
      testFieldKey,
      'Kiểm thử tự động E2E',
      emp2.id,
    );
    assert(opt3.usage_count === 1, 'Third option created with usage_count 1');

    // 6. Test ordering: opt3 was used last, so opt3 should appear at top
    const orderedList = await dynamicOptionsService.getOptions({ fieldKey: testFieldKey });
    assert(orderedList.length === 3, 'Returns all 3 options');
    assert(orderedList[0].value === 'Kiểm thử tự động E2E', 'Most recently used option is first (opt3)');
    assert(orderedList[1].value === 'Xây dựng API Backend', 'Second most recently used is second (opt2)');
    assert(orderedList[2].value === 'Thiết kế giao diện UI/UX', 'Older option is third (opt1)');

    // 7. Now emp1 reuses opt1 again -> opt1 should jump to the top
    await new Promise((r) => setTimeout(r, 50));
    await dynamicOptionsService.recordOptionUse(
      testFieldKey,
      'Thiết kế giao diện UI/UX',
      emp1.id,
    );
    const reorderedList = await dynamicOptionsService.getOptions({ fieldKey: testFieldKey });
    assert(reorderedList[0].value === 'Thiết kế giao diện UI/UX', 'Reused option immediately jumps to first position');
    assert(reorderedList[0].usage_count === 3, 'Usage count increased to 3');

    // 8. Search query filtering
    const searchResults = await dynamicOptionsService.getOptions({ fieldKey: testFieldKey, q: 'API' });
    assert(searchResults.length === 1 && searchResults[0].value === 'Xây dựng API Backend', 'Search query filters correctly');

    // 9. Validation on empty or blank strings
    let emptyRejected = false;
    try {
      await dynamicOptionsService.recordOptionUse(testFieldKey, '   ', emp1.id);
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        emptyRejected = true;
      }
    }
    assert(emptyRejected, 'Reject blank or empty option value');

    // 10. Verify Business Enums are NOT dynamic options
    // Business enums are defined statically and cannot be polluted
    const projectStatuses = ['ASSIGNED', 'READY_TO_START', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'BLOCKED', 'REVIEW', 'ACCEPTANCE', 'COMPLETED', 'CANCELLED'];
    const taskStatuses = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];
    const assignmentTypes = ['PRIMARY', 'SUPPORT'];
    const roles = ['BOSS', 'SALES_TEAM_LEADER', 'SALE', 'DEV_TEAM_LEADER', 'DEV', 'SEO_TEAM_LEADER', 'SEO'];
    
    assert(projectStatuses.length === 9, 'Project status enum is fixed with 9 business values');
    assert(taskStatuses.length === 4, 'Task status enum is fixed with 4 business values');
    assert(assignmentTypes.length === 2, 'Assignment type enum is fixed (PRIMARY/SUPPORT)');
    assert(roles.length === 7, 'System roles enum is fixed with 7 business roles');

    // Clean up test data
    await kysely.db.deleteFrom('dynamic_options').where('field_key', '=', testFieldKey).execute();
    await kysely.db.deleteFrom('employees').where('id', 'in', [emp1.id, emp2.id]).execute();

  } catch (error: any) {
    console.error('Fatal test error:', error);
    failed++;
  } finally {
    await app.close();
  }

  console.log('==================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runDynamicOptionsIntegrationTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
