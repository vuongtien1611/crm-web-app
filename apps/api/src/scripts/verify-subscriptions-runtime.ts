async function verifySubscriptionsRuntime() {
  console.log('================================================================');
  console.log('STARTING PHASE J SUBSCRIPTION FRONTEND RUNTIME VERIFICATION');
  console.log('================================================================');

  const API_URL = 'http://localhost:3000/api';

  async function login(identifier: string, password: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      throw new Error(`Login failed for ${identifier}: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  // 1. Admin login
  console.log('1. Logging in as Admin...');
  const adminAuth = await login('admin', 'AdminPass123!@#');
  console.log(`   ✅ Logged in as ${adminAuth.user.username}`);

  // 2. Query Subscriptions List
  console.log('2. Querying GET /subscriptions list...');
  const listRes = await fetch(`${API_URL}/subscriptions?page=1&limit=10`, {
    headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
  });
  if (!listRes.ok) {
    throw new Error(`Failed to fetch subscriptions: ${listRes.status} ${await listRes.text()}`);
  }
  const list = await listRes.json();
  console.log(`   ✅ Found ${list.total} subscriptions, totalActive: ${list.summary.totalActive}`);
  if (!Array.isArray(list.data) || list.data.length === 0) {
    throw new Error('Expected subscriptions list to contain at least 1 record');
  }

  const sampleSub = list.data[0];
  console.log(`   Sample Sub #${sampleSub.id}: Customer="${sampleSub.customer.name}", Service="${sampleSub.service.name}", Status="${sampleSub.status}"`);

  // 3. Query Subscription Detail
  console.log(`3. Querying GET /subscriptions/${sampleSub.id} detail...`);
  const detailRes = await fetch(`${API_URL}/subscriptions/${sampleSub.id}`, {
    headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
  });
  if (!detailRes.ok) {
    throw new Error(`Failed to fetch subscription detail: ${detailRes.status} ${await detailRes.text()}`);
  }
  const detail = await detailRes.json();
  console.log(`   ✅ Detail loaded: ${detail.periods.length} periods, Payment Plan: ${detail.paymentPlan ? 'YES' : 'NONE'}, Linked Project: ${detail.linkedProject ? detail.linkedProject.projectName : 'NONE'}`);

  // 4. Test Search filter
  console.log('4. Testing search filter...');
  const searchKeyword = sampleSub.orderCode;
  const searchRes = await fetch(`${API_URL}/subscriptions?search=${encodeURIComponent(searchKeyword)}`, {
    headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
  });
  const searchData = await searchRes.json();
  const searchMatch = searchData.data.some((s: any) => s.id === sampleSub.id);
  if (!searchMatch) throw new Error(`Search for ${searchKeyword} did not return sample subscription`);
  console.log(`   ✅ Search for "${searchKeyword}" matched successfully`);

  // 5. Test Status filter
  console.log('5. Testing status filter (status=ACTIVE)...');
  const activeRes = await fetch(`${API_URL}/subscriptions?status=ACTIVE`, {
    headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
  });
  const activeData = await activeRes.json();
  const allActive = activeData.data.every((s: any) => s.status === 'ACTIVE');
  if (!allActive) throw new Error('Status filter returned non-ACTIVE records');
  console.log(`   ✅ Status filter ACTIVE verified (${activeData.data.length} records)`);

  // 6. Test Interval filter
  console.log('6. Testing billing_interval filter...');
  const intervalRes = await fetch(`${API_URL}/subscriptions?billing_interval=${sampleSub.billingInterval}`, {
    headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
  });
  const intervalData = await intervalRes.json();
  const allMatchInterval = intervalData.data.every((s: any) => s.billingInterval === sampleSub.billingInterval);
  if (!allMatchInterval) throw new Error('Interval filter returned mismatched billing_interval');
  console.log(`   ✅ Billing interval filter (${sampleSub.billingInterval}) verified`);

  // 7. Test 404 for non-existent ID
  console.log('7. Testing 404 for non-existent subscription...');
  const notFoundRes = await fetch(`${API_URL}/subscriptions/99999999`, {
    headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
  });
  if (notFoundRes.status !== 404) {
    throw new Error(`Expected 404 but got ${notFoundRes.status}`);
  }
  console.log('   ✅ 404 NotFoundException verified correctly');

  console.log('================================================================');
  console.log('PHASE J SUBSCRIPTION RUNTIME VERIFICATION PASSED PERFECTLY! ✅');
  console.log('================================================================');
}

verifySubscriptionsRuntime().catch((err) => {
  console.error('❌ Phase J runtime verification failed:', err);
  process.exit(1);
});
