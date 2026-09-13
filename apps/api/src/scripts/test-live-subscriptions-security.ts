async function testLiveApiRoles() {
  console.log('====================================================');
  console.log('VERIFYING LIVE REST API OBJECT AUTHORIZATION & MUTATION GUARDS');
  console.log('====================================================');

  const API_URL = 'http://localhost:3000/api';

  async function login(username: string): Promise<string> {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: username, password: 'Password123!@#' }),
    });
    if (!res.ok) {
      throw new Error(`Login failed for ${username}: status ${res.status}`);
    }
    const data = await res.json();
    return data.accessToken;
  }

  async function getSubscriptions(token: string) {
    const res = await fetch(`${API_URL}/subscriptions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, data: await res.json() };
  }

  async function getSubscriptionDetail(id: number | string, token: string) {
    const res = await fetch(`${API_URL}/subscriptions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, data: res.status === 200 ? await res.json() : null };
  }

  async function generatePeriods(id: number | string, token: string) {
    const res = await fetch(`${API_URL}/subscriptions/${id}/generate-periods`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 1 }),
    });
    return { status: res.status };
  }

  async function cancelSub(id: number | string, token: string) {
    const res = await fetch(`${API_URL}/subscriptions/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status };
  }

  function assert(cond: boolean, desc: string) {
    if (!cond) {
      console.error(`❌ FAIL: ${desc}`);
      process.exit(1);
    }
    console.log(`✅ PASS: ${desc}`);
  }

  // 1. ADMIN
  const adminToken = await login('admin_j');
  const adminList = await getSubscriptions(adminToken);
  assert(adminList.status === 200, 'ADMIN GET /subscriptions returns 200');
  const hasSubAInAdmin = adminList.data.data.some((s: any) => s.id === '171');
  const hasSubBInAdmin = adminList.data.data.some((s: any) => s.id === '172');
  assert(hasSubAInAdmin && hasSubBInAdmin, 'ADMIN sees both Sub 171 and Sub 172 in list (Global Scope)');

  const adminDetA = await getSubscriptionDetail(171, adminToken);
  const adminDetB = await getSubscriptionDetail(172, adminToken);
  assert(adminDetA.status === 200 && adminDetB.status === 200, 'ADMIN can view details of both Sub 171 and Sub 172');

  const adminGen = await generatePeriods(171, adminToken);
  assert(adminGen.status === 201 || adminGen.status === 200, 'ADMIN can call generate-periods');

  // 2. SALE A
  const saleAToken = await login('sale_a_j');
  const saleAList = await getSubscriptions(saleAToken);
  const hasSubAInSaleA = saleAList.data.data.some((s: any) => s.id === '171');
  const hasSubBInSaleA = saleAList.data.data.some((s: any) => s.id === '172');
  assert(hasSubAInSaleA && !hasSubBInSaleA, 'SALE A sees own Sub 171 and NOT Sub 172 (Ownership Scope)');

  const saleADetA = await getSubscriptionDetail(171, saleAToken);
  const saleADetB = await getSubscriptionDetail(172, saleAToken);
  assert(saleADetA.status === 200, 'SALE A can view detail of own Sub 171');
  assert(saleADetB.status === 403, 'SALE A detail of out-of-scope Sub 172 returns 403 Forbidden');

  const saleAGen = await generatePeriods(171, saleAToken);
  const saleACancel = await cancelSub(171, saleAToken);
  assert(saleAGen.status === 403, 'SALE A generate-periods returns 403 Forbidden');
  assert(saleACancel.status === 403, 'SALE A cancel returns 403 Forbidden');

  // 3. SALES TEAM LEADER A
  const sLeaderToken = await login('s_lead_j');
  const sLeaderList = await getSubscriptions(sLeaderToken);
  const hasSubAInSLead = sLeaderList.data.data.some((s: any) => s.id === '171');
  const hasSubBInSLead = sLeaderList.data.data.some((s: any) => s.id === '172');
  assert(hasSubAInSLead && !hasSubBInSLead, 'SALES LEADER sees Team A Sub 171 and NOT Sub 172 (Team Scope)');

  const sLeaderDetA = await getSubscriptionDetail(171, sLeaderToken);
  const sLeaderDetB = await getSubscriptionDetail(172, sLeaderToken);
  assert(sLeaderDetA.status === 200, 'SALES LEADER can view detail of Team A Sub 171');
  assert(sLeaderDetB.status === 403, 'SALES LEADER detail of out-of-team Sub 172 returns 403 Forbidden');

  // 4. DEV TEAM LEADER A (Team has assignment to Sub 171)
  const dLeaderToken = await login('d_lead_j');
  const dLeaderList = await getSubscriptions(dLeaderToken);
  const hasSubAInDLead = dLeaderList.data.data.some((s: any) => s.id === '171');
  const hasSubBInDLead = dLeaderList.data.data.some((s: any) => s.id === '172');
  assert(hasSubAInDLead && !hasSubBInDLead, 'DEV LEADER A sees assigned Sub 171 and NOT Sub 172 (Tech Assignment Scope)');

  const dLeaderDetA = await getSubscriptionDetail(171, dLeaderToken);
  const dLeaderDetB = await getSubscriptionDetail(172, dLeaderToken);
  assert(dLeaderDetA.status === 200, 'DEV LEADER A can view detail of assigned Sub 171');
  assert(dLeaderDetB.status === 403, 'DEV LEADER A detail of unassigned Sub 172 returns 403 Forbidden');

  const dLeaderGen = await generatePeriods(171, dLeaderToken);
  assert(dLeaderGen.status === 403, 'DEV LEADER A generate-periods returns 403 Forbidden');

  // 5. DEV TEAM LEADER B (Team has NO assignments)
  const dLeaderBToken = await login('d_lead_b_j');
  const dLeaderBList = await getSubscriptions(dLeaderBToken);
  const hasSubAInDLeadB = dLeaderBList.data.data.some((s: any) => s.id === '171');
  const hasSubBInDLeadB = dLeaderBList.data.data.some((s: any) => s.id === '172');
  assert(!hasSubAInDLeadB && !hasSubBInDLeadB, 'DEV LEADER B with 0 assignments sees NO subscriptions in list');

  const dLeaderBDetA = await getSubscriptionDetail(171, dLeaderBToken);
  assert(dLeaderBDetA.status === 403, 'DEV LEADER B detail of Sub 171 returns 403 Forbidden');

  // 6. ACCOUNTANT (Sub 171 has approved payment plan; Sub 172 does not)
  const acctToken = await login('acct_j');
  const acctList = await getSubscriptions(acctToken);
  const hasSubAInAcct = acctList.data.data.some((s: any) => s.id === '171');
  const hasSubBInAcct = acctList.data.data.some((s: any) => s.id === '172');
  assert(hasSubAInAcct && !hasSubBInAcct, 'ACCOUNTANT sees Sub 171 (approved payment plan) and NOT Sub 172 (no payment plan)');

  const acctDetA = await getSubscriptionDetail(171, acctToken);
  const acctDetB = await getSubscriptionDetail(172, acctToken);
  assert(acctDetA.status === 200, 'ACCOUNTANT can view detail of Sub 171 (Accounting Scope)');
  assert(acctDetB.status === 403, 'ACCOUNTANT detail of Sub 172 without payment obligations returns 403 Forbidden');

  const acctGen = await generatePeriods(171, acctToken);
  const acctCancel = await cancelSub(171, acctToken);
  assert(acctGen.status === 403, 'ACCOUNTANT generate-periods returns 403 Forbidden');
  assert(acctCancel.status === 403, 'ACCOUNTANT cancel returns 403 Forbidden');

  console.log('====================================================');
  console.log('ALL LIVE API SECURITY CHECKS PASSED PERFECTLY! 🚀');
  console.log('====================================================');
}

testLiveApiRoles().catch((err) => {
  console.error('❌ Error during live API test:', err);
  process.exit(1);
});
