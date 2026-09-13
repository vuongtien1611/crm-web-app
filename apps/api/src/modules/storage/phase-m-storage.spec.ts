import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';

function assert(condition: boolean, message: string, detail?: any) {
  if (!condition) {
    const d = detail ? ` (Detail: ${JSON.stringify(detail)})` : '';
    throw new Error(`Assertion Failed: ${message}${d}`);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runPhaseMStorageSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE M: FILE STORAGE INTEGRATION SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get<KyselyService>(KyselyService);
  const db = kysely.db;
  const storageService = app.get<StorageService>(StorageService);
  const storageController = app.get<StorageController>(StorageController);

  const runId = Math.floor(Math.random() * 1000000);

  try {
    console.log('--- Setting up test fixtures ---');
    // Positions
    const salePos = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirst();
    const devPos = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirst();
    const posId = salePos ? salePos.id : (1 as any);

    // 1. Boss user & employee
    const [bossUser] = await db
      .insertInto('users')
      .values({ username: `boss_st_${runId}`, password_hash: 'hash', email: `boss_st_${runId}@test.com` })
      .returningAll()
      .execute();
    const [bossEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-BOSS-ST-${runId}`, full_name: `Boss User ST ${runId}`, position_id: posId, user_id: bossUser.id })
      .returningAll()
      .execute();
    const bossRole = await db.selectFrom('roles').selectAll().where('code', '=', 'BOSS').executeTakeFirst();
    if (bossRole) {
      await db.insertInto('user_roles').values({ user_id: bossUser.id, role_id: bossRole.id }).execute();
    }

    // 2. Accountant user & employee
    const [accUser] = await db
      .insertInto('users')
      .values({ username: `acc_st_${runId}`, password_hash: 'hash', email: `acc_st_${runId}@test.com` })
      .returningAll()
      .execute();
    const [accEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-ACC-ST-${runId}`, full_name: `Accountant ST ${runId}`, position_id: posId, user_id: accUser.id })
      .returningAll()
      .execute();
    const accRole = await db.selectFrom('roles').selectAll().where('code', '=', 'ACCOUNTANT').executeTakeFirst();
    if (accRole) {
      await db.insertInto('user_roles').values({ user_id: accUser.id, role_id: accRole.id }).execute();
    }

    // 3. Sale A (creator) user & employee
    const [saleAUser] = await db
      .insertInto('users')
      .values({ username: `sale_a_st_${runId}`, password_hash: 'hash', email: `sale_a_st_${runId}@test.com` })
      .returningAll()
      .execute();
    const [saleAEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-SALE-A-ST-${runId}`, full_name: `Sale A ST ${runId}`, position_id: posId, user_id: saleAUser.id })
      .returningAll()
      .execute();
    const saleRole = await db.selectFrom('roles').selectAll().where('code', '=', 'SALE').executeTakeFirst();
    if (saleRole) {
      await db.insertInto('user_roles').values({ user_id: saleAUser.id, role_id: saleRole.id }).execute();
    }

    // 4. Sale B (unrelated) user & employee
    const [saleBUser] = await db
      .insertInto('users')
      .values({ username: `sale_b_st_${runId}`, password_hash: 'hash', email: `sale_b_st_${runId}@test.com` })
      .returningAll()
      .execute();
    const [saleBEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-SALE-B-ST-${runId}`, full_name: `Sale B ST ${runId}`, position_id: posId, user_id: saleBUser.id })
      .returningAll()
      .execute();
    if (saleRole) {
      await db.insertInto('user_roles').values({ user_id: saleBUser.id, role_id: saleRole.id }).execute();
    }

    // 5. Dev Team A & Member
    const [devAUser] = await db
      .insertInto('users')
      .values({ username: `dev_a_st_${runId}`, password_hash: 'hash', email: `dev_a_st_${runId}@test.com` })
      .returningAll()
      .execute();
    const [devAEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-DEV-A-ST-${runId}`, full_name: `Dev A ST ${runId}`, position_id: devPos ? devPos.id : posId, user_id: devAUser.id })
      .returningAll()
      .execute();
    const devRole = await db.selectFrom('roles').selectAll().where('code', '=', 'DEV').executeTakeFirst();
    if (devRole) {
      await db.insertInto('user_roles').values({ user_id: devAUser.id, role_id: devRole.id }).execute();
    }

    // 6. Dev Team B & Member
    const [devBUser] = await db
      .insertInto('users')
      .values({ username: `dev_b_st_${runId}`, password_hash: 'hash', email: `dev_b_st_${runId}@test.com` })
      .returningAll()
      .execute();
    const [devBEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-DEV-B-ST-${runId}`, full_name: `Dev B ST ${runId}`, position_id: devPos ? devPos.id : posId, user_id: devBUser.id })
      .returningAll()
      .execute();
    if (devRole) {
      await db.insertInto('user_roles').values({ user_id: devBUser.id, role_id: devRole.id }).execute();
    }

    // Teams
    const [teamA] = await db
      .insertInto('teams')
      .values({ name: `Team A ST ${runId}`, code: `TM-A-${runId}`, department: 'DEV' })
      .returningAll()
      .execute();
    await db.insertInto('team_memberships').values({
      team_id: teamA.id,
      employee_id: devAEmp.id,
      is_leader: false,
      effective_range: sql`tstzrange(NOW() - INTERVAL '5 days', NULL, '[]')` as any,
    }).execute();

    const [teamB] = await db
      .insertInto('teams')
      .values({ name: `Team B ST ${runId}`, code: `TM-B-${runId}`, department: 'DEV' })
      .returningAll()
      .execute();
    await db.insertInto('team_memberships').values({
      team_id: teamB.id,
      employee_id: devBEmp.id,
      is_leader: false,
      effective_range: sql`tstzrange(NOW() - INTERVAL '5 days', NULL, '[]')` as any,
    }).execute();

    // Account & Contact
    const [account] = await db
      .insertInto('accounts')
      .values({ company_name: `Corp ST ${runId}`, phone: `0999${runId.toString().slice(0, 6)}`, email: `client_st_${runId}@test.com` })
      .returningAll()
      .execute();
    const [contact] = await db
      .insertInto('contacts')
      .values({ account_id: account.id, full_name: `Contact ST ${runId}`, phone: `0999${runId.toString().slice(0, 6)}`, email: `contact_st_${runId}@test.com`, is_primary: true })
      .returningAll()
      .execute();

    // Order & Project for Team A
    const [order] = await db
      .insertInto('orders')
      .values({ order_code: `ORD-ST-${runId}`, account_id: account.id, primary_contact_id: contact.id, workflow_status: 'APPROVED' })
      .returningAll()
      .execute();
    const [service] = await db
      .insertInto('services')
      .values({ name: `Service ST ${runId}`, code: `SRV-ST-${runId}`, service_type: 'PROJECT', is_active: true })
      .returningAll()
      .execute();
    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const reqTemplateId = reqTemplate ? reqTemplate.id : (1 as any);

    const [orderItem] = await db
      .insertInto('order_items')
      .values({
        order_id: order.id,
        service_id: service.id,
        closing_sale_id: saleAEmp.id,
        requirement_template_id: reqTemplateId,
        requirement_template_version: 1,
        original_price: 50000000,
        net_service_value: 50000000,
        approval_status: 'APPROVED',
        delivery_status: 'IN_PROGRESS',
      })
      .returningAll()
      .execute();
    const [projectA] = await db
      .insertInto('projects')
      .values({ order_item_id: orderItem.id, project_name: `Project A ST ${runId}`, status: 'IN_PROGRESS' })
      .returningAll()
      .execute();

    // Assign Dev A to Project A
    await db.insertInto('project_assignments').values({
      project_id: projectA.id,
      employee_id: devAEmp.id,
      assignment_type: 'PRIMARY',
      is_active: true,
      assigned_at: new Date(),
    }).execute();

    console.log('--- Test Fixtures ready ---');

    // Sample valid PDF buffer (%PDF-1.4 header)
    const validPdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\nxref\n0 2\n0000000000 65535 f\n0000000015 00000 n\ntrailer<</Size 2/Root 1 0 R>>\nstartxref\n68\n%%EOF');
    // Sample valid PNG buffer
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);

    // ----------------------------------------------------------------
    // ST-01: UPLOAD VALID FILE SUCCESS
    // ----------------------------------------------------------------
    console.log('\n--- ST-01: Upload Valid File Success ---');
    const uploadRes = await storageService.uploadFile({
      entityType: 'payments',
      entityId: 101,
      filename: 'bank_receipt.pdf',
      buffer: validPdfBuffer,
      claimedMimeType: 'application/pdf',
    });
    assert(!!uploadRes.objectKey, 'ST-01: Valid PDF uploaded and returned objectKey');
    assert(uploadRes.objectKey.startsWith('payments/101/'), 'ST-01: Object key has canonical entity prefix payments/101/');
    assert(uploadRes.filename === 'bank_receipt.pdf', 'ST-01: Sanitized filename preserved');
    assert(uploadRes.mimeType === 'application/pdf', 'ST-01: Correct MIME type assigned');

    // ----------------------------------------------------------------
    // ST-02: REJECT INVALID MIME / EXECUTABLE
    // ----------------------------------------------------------------
    console.log('\n--- ST-02: Reject Invalid MIME / Executable ---');
    let rejectedExecutable = false;
    try {
      await storageService.uploadFile({
        entityType: 'payments',
        entityId: 101,
        filename: 'malicious.sh',
        buffer: Buffer.from('#!/bin/bash\nrm -rf /'),
        claimedMimeType: 'application/x-sh',
      });
    } catch (e: any) {
      if (e instanceof BadRequestException) {
        rejectedExecutable = true;
      }
    }
    assert(rejectedExecutable, 'ST-02: Disallowed extension (.sh) was strictly rejected');

    let rejectedMimeMismatch = false;
    try {
      // Fake extension .pdf but content is bash script
      await storageService.uploadFile({
        entityType: 'payments',
        entityId: 101,
        filename: 'fake.pdf',
        buffer: Buffer.from('#!/bin/bash\necho hacked'),
        claimedMimeType: 'application/pdf',
      });
    } catch (e: any) {
      if (e instanceof BadRequestException) {
        rejectedMimeMismatch = true;
      }
    }
    assert(rejectedMimeMismatch, 'ST-02: Magic bytes mismatch rejected (client MIME not blindly trusted)');

    // ----------------------------------------------------------------
    // ST-03: REJECT OVERSIZED FILE
    // ----------------------------------------------------------------
    console.log('\n--- ST-03: Reject Oversized File ---');
    const originalMaxMb = process.env.MAX_UPLOAD_SIZE_MB;
    process.env.MAX_UPLOAD_SIZE_MB = '1'; // 1 MB limit for test

    const oversizedBuffer = Buffer.alloc(1.5 * 1024 * 1024);
    // Write valid PDF header to pass signature check
    oversizedBuffer.write('%PDF-1.4');

    let rejectedOversized = false;
    try {
      await storageService.uploadFile({
        entityType: 'payments',
        entityId: 101,
        filename: 'large.pdf',
        buffer: oversizedBuffer,
        claimedMimeType: 'application/pdf',
      });
    } catch (e: any) {
      if (e instanceof BadRequestException) {
        rejectedOversized = true;
      }
    }
    process.env.MAX_UPLOAD_SIZE_MB = originalMaxMb || '10'; // restore
    assert(rejectedOversized, 'ST-03: Oversized file was rejected according to MAX_UPLOAD_SIZE_MB config');

    // ----------------------------------------------------------------
    // ST-04: NO OBJECT KEY COLLISION FOR SAME FILENAME
    // ----------------------------------------------------------------
    console.log('\n--- ST-04: Object Key Collision Prevention ---');
    const u1 = await storageService.uploadFile({
      entityType: 'payments',
      entityId: 202,
      filename: 'receipt.png',
      buffer: validPngBuffer,
      claimedMimeType: 'image/png',
    });
    const u2 = await storageService.uploadFile({
      entityType: 'payments',
      entityId: 202,
      filename: 'receipt.png',
      buffer: validPngBuffer,
      claimedMimeType: 'image/png',
    });
    assert(u1.objectKey !== u2.objectKey, 'ST-04: Same filename uploads produced unique distinct object keys', {
      key1: u1.objectKey,
      key2: u2.objectKey,
    });

    // ----------------------------------------------------------------
    // ST-05: UNAUTHORIZED ACTOR CANNOT DOWNLOAD PAYMENT PROOF
    // ----------------------------------------------------------------
    console.log('\n--- ST-05: Unauthorized Actor Cannot Download Payment Proof ---');
    // Create payment created by Sale A
    const [testPayment] = await db
      .insertInto('payments')
      .values({
        payment_code: `PAY-ST-${runId}`,
        gross_cash_amount: 15000000,
        payment_method: 'BANK_TRANSFER',
        evidence_url: u1.objectKey,
        created_by_employee_id: saleAEmp.id,
        status: 'PENDING_CONFIRMATION',
      })
      .returningAll()
      .execute();

    let saleBBlocked = false;
    try {
      // Sale B attempts to access Sale A's payment proof
      const saleBReq = { user: { employeeId: String(saleBEmp.id), roles: ['SALE'] } };
      await storageController.getPaymentProof(String(testPayment.id), saleBReq);
    } catch (e: any) {
      if (e instanceof ForbiddenException) {
        saleBBlocked = true;
      }
    }
    assert(saleBBlocked, 'ST-05: Unauthorized Sale B blocked with 403 Forbidden from viewing Sale A payment proof');

    // ----------------------------------------------------------------
    // ST-06: AUTHORIZED PAYMENT ACTORS CAN DOWNLOAD PAYMENT PROOF
    // ----------------------------------------------------------------
    console.log('\n--- ST-06: Authorized Payment Actors Can Download Payment Proof ---');
    // 1. Sale A (creator)
    const saleAReq = { user: { employeeId: String(saleAEmp.id), roles: ['SALE'] } };
    const saleARes = await storageController.getPaymentProof(String(testPayment.id), saleAReq);
    assert(!!saleARes.downloadUrl, 'ST-06.1: Sale A (creator) can download own payment proof');

    // 2. Accountant
    const accReq = { user: { employeeId: String(accEmp.id), roles: ['ACCOUNTANT'] } };
    const accRes = await storageController.getPaymentProof(String(testPayment.id), accReq);
    assert(!!accRes.downloadUrl, 'ST-06.2: Accountant can download payment proof');

    // 3. Boss
    const bossReq = { user: { employeeId: String(bossEmp.id), roles: ['BOSS'] } };
    const bossRes = await storageController.getPaymentProof(String(testPayment.id), bossReq);
    assert(!!bossRes.downloadUrl, 'ST-06.3: Boss can download payment proof');

    // ----------------------------------------------------------------
    // ST-07: PROJECT TEAM A CANNOT READ PROJECT TEAM B FILES
    // ----------------------------------------------------------------
    console.log('\n--- ST-07: Project Isolation Between Teams ---');
    // Upload acceptance evidence for Project A
    const projectAEvidUpload = await storageService.uploadFile({
      entityType: 'project-acceptances',
      entityId: projectA.id,
      filename: 'acceptance_signed.pdf',
      buffer: validPdfBuffer,
      claimedMimeType: 'application/pdf',
    });

    await db.insertInto('project_acceptances').values({
      project_id: projectA.id,
      customer_contact_id: contact.id,
      accepted_by_name: 'Customer Rep',
      evidence_document: projectAEvidUpload.objectKey,
      recorded_by_employee_id: bossEmp.id,
    }).execute();

    // Dev B (from Team B) tries to read Project A acceptance evidence
    let devBBlocked = false;
    try {
      const devBReq = { user: { employeeId: String(devBEmp.id), roles: ['DEV'] } };
      await storageController.getProjectAcceptanceEvidence(String(projectA.id), devBReq);
    } catch (e: any) {
      if (e instanceof ForbiddenException) {
        devBBlocked = true;
      }
    }
    assert(devBBlocked, 'ST-07: Dev member of Team B is blocked (403) from reading Project of Team A');

    // Dev A (assigned to Project A) CAN read
    const devAReq = { user: { employeeId: String(devAEmp.id), roles: ['DEV'] } };
    const devARes = await storageController.getProjectAcceptanceEvidence(String(projectA.id), devAReq);
    assert(devARes.objectKey === projectAEvidUpload.objectKey, 'ST-07: Assigned Dev A successfully downloads Project A acceptance evidence');

    // ----------------------------------------------------------------
    // ST-08: ACCEPTANCE EVIDENCE MAPS CORRECTLY TO ACCEPTANCE RECORD
    // ----------------------------------------------------------------
    console.log('\n--- ST-08: Acceptance Evidence Maps Correctly ---');
    const accRecord = await db
      .selectFrom('project_acceptances')
      .selectAll()
      .where('project_id', '=', projectA.id)
      .executeTakeFirstOrThrow();
    assert(accRecord.evidence_document === projectAEvidUpload.objectKey, 'ST-08: DB acceptance record strictly holds stable object key (not transient URL)');

    // ----------------------------------------------------------------
    // ST-09: DELETE / REPLACEMENT
    // ----------------------------------------------------------------
    console.log('\n--- ST-09: Delete From Storage ---');
    const tempFile = await storageService.uploadFile({
      entityType: 'projects',
      entityId: projectA.id,
      filename: 'temp_notes.pdf',
      buffer: validPdfBuffer,
      claimedMimeType: 'application/pdf',
    });
    assert(await storageService.exists(tempFile.objectKey), 'ST-09: File exists before deletion');
    await storageService.deleteFile(tempFile.objectKey);
    assert(!(await storageService.exists(tempFile.objectKey)), 'ST-09: File deleted successfully from storage provider');

    // ----------------------------------------------------------------
    // ST-10: DISTRIBUTED FAILURE COMPENSATION (DB FAILS -> STORAGE CLEANUP)
    // ----------------------------------------------------------------
    console.log('\n--- ST-10: Distributed Failure Compensation (DB Fails -> Storage Cleanup) ---');
    let orphanKey = '';
    let caughtCompensationError = false;

    try {
      await storageService.executeWithCompensatingCleanup(
        async () => {
          const up = await storageService.uploadFile({
            entityType: 'payments',
            entityId: 999,
            filename: 'orphan_test.pdf',
            buffer: validPdfBuffer,
            claimedMimeType: 'application/pdf',
          });
          orphanKey = up.objectKey;
          return up;
        },
        async (objectKey: string) => {
          // Verify it was temporarily uploaded
          assert(await storageService.exists(objectKey), 'ST-10: File was successfully uploaded to storage initially');
          // Now force a DB transaction failure (e.g. unique constraint or manual error)
          throw new Error('INTENTIONAL_DB_MUTATION_FAILURE');
        },
      );
    } catch (err: any) {
      if (err.message === 'INTENTIONAL_DB_MUTATION_FAILURE') {
        caughtCompensationError = true;
      }
    }

    assert(caughtCompensationError, 'ST-10: Intentional DB failure caught as expected');
    // Verify compensating cleanup deleted the orphan object from storage
    const stillExists = await storageService.exists(orphanKey);
    assert(!stillExists, 'ST-10: Orphan object was cleanly deleted by compensating rollback (0 orphan objects left)');

    // ----------------------------------------------------------------
    // ST-11: ACCEPTANCE NOT NULL: STORAGE UPLOAD FAIL -> NO ACCEPTANCE CREATED
    // ----------------------------------------------------------------
    console.log('\n--- ST-11: Storage Upload Fail -> Acceptance Not Created ---');
    let uploadFailed = false;
    try {
      await storageService.executeWithCompensatingCleanup(
        async () => {
          // Simulate storage provider upload failure
          throw new Error('STORAGE_UPLOAD_DISCONNECTED');
        },
        async (objectKey: string) => {
          // Should NEVER be reached!
          await db.insertInto('project_acceptances').values({
            project_id: 88888 as any,
            customer_contact_id: contact.id,
            accepted_by_name: 'Should Not Exist',
            evidence_document: objectKey,
            recorded_by_employee_id: bossEmp.id,
          }).execute();
        },
      );
    } catch (err: any) {
      if (err.message === 'STORAGE_UPLOAD_DISCONNECTED') {
        uploadFailed = true;
      }
    }
    assert(uploadFailed, 'ST-11: Storage failure prevented acceptance DB execution completely');

    // ----------------------------------------------------------------
    // ST-12: DB ACCEPTANCE INSERT FAIL -> UPLOADED OBJECT CLEANED UP
    // ----------------------------------------------------------------
    console.log('\n--- ST-12: DB Acceptance Insert Fail -> Uploaded Object Cleaned Up ---');
    let accUploadKey = '';
    let accDbFailed = false;

    try {
      await storageService.executeWithCompensatingCleanup(
        async () => {
          const up = await storageService.uploadFile({
            entityType: 'project-acceptances',
            entityId: projectA.id,
            filename: 'acc_dup_test.pdf',
            buffer: validPdfBuffer,
            claimedMimeType: 'application/pdf',
          });
          accUploadKey = up.objectKey;
          return up;
        },
        async (objectKey: string) => {
          // Try to insert duplicate acceptance on projectA which already has an acceptance (UNIQUE project_id)
          await db.insertInto('project_acceptances').values({
            project_id: projectA.id, // Will fail with duplicate key violates unique constraint
            customer_contact_id: contact.id,
            accepted_by_name: 'Duplicate Rep',
            evidence_document: objectKey,
            recorded_by_employee_id: bossEmp.id,
          }).execute();
        },
      );
    } catch (err: any) {
      accDbFailed = true;
    }

    assert(accDbFailed, 'ST-12: Duplicate acceptance constraint violation occurred in DB');
    const accKeyExists = await storageService.exists(accUploadKey);
    assert(!accKeyExists, 'ST-12: Uploaded acceptance evidence was compensated and deleted after DB constraint violation');

    console.log('\n====================================================');
    console.log('✅ ALL ST-01 THROUGH ST-12 PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Phase M Storage Suite execution failed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runPhaseMStorageSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
