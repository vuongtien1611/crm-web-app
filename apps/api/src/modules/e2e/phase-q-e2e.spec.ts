import { runPhaseQCanonicalSuite } from './phase-q-canonical-e2e.spec';
import { runPhaseQNegativeSuite } from './phase-q-negative.spec';
import { runPhaseQConcurrencySuite } from './phase-q-concurrency.spec';
import { runPhaseQSecuritySuite } from './phase-q-security.spec';
import { runPhaseQPerfSuite } from './phase-q-perf.spec';

async function main() {
  const startTime = Date.now();
  console.log('\n================================================================');
  console.log('🚀 MASTER RUNNER: PHASE Q FULL E2E, SECURITY & PERFORMANCE SUITE');
  console.log('================================================================\n');

  try {
    console.log('\n>>> STAGE 1: CANONICAL BUSINESS E2E WORKFLOW (A - M) <<<');
    await runPhaseQCanonicalSuite();

    console.log('\n>>> STAGE 2: NEGATIVE INVARIANTS (Q-NEG-01 - Q-NEG-10) <<<');
    await runPhaseQNegativeSuite();

    console.log('\n>>> STAGE 3: CONCURRENCY HARDENING (Q-CON-01 - Q-CON-06) <<<');
    await runPhaseQConcurrencySuite();

    console.log('\n>>> STAGE 4: SECURITY, IDOR & RBAC MATRIX AUDIT <<<');
    await runPhaseQSecuritySuite();

    console.log('\n>>> STAGE 5: PERFORMANCE BASELINE & SYSTEM RESILIENCE <<<');
    await runPhaseQPerfSuite();

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n================================================================');
    console.log(`🎉 ALL PHASE Q E2E SUITES PASSED PERFECTLY IN ${duration}s! (EXIT 0)`);
    console.log('================================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ MASTER RUNNER FAILED:', error);
    process.exit(1);
  }
}

main();
