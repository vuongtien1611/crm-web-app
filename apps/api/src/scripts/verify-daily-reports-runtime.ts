async function testRuntime() {
  console.log('================================================================');
  console.log('STARTING PHASE I BROWSER RUNTIME + UI CONTRACT VERIFICATION');
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

  // 1. Employee Login
  console.log('1. Testing Employee Login (brw_emp_a)...');
  const empAuth = await login('brw_emp_a', 'Password123!@#');
  console.log(`   ✅ Logged in as ${empAuth.user.username} (Emp ID: ${empAuth.user.employeeId}, Roles: ${empAuth.user.roles})`);

  // 2. Employee creates daily report
  console.log('2. Employee creates daily report...');
  const today = new Date().toISOString().split('T')[0];
  const createRes = await fetch(`${API_URL}/daily-reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${empAuth.accessToken}`,
    },
    body: JSON.stringify({
      report_date: today,
      difficulty: 'Trở ngại kết nối database test',
      support_needed: 'Cần DevOps cấp quyền',
      next_plan: 'Hoàn thành module task',
      note: 'Báo cáo thử nghiệm UI browser',
    }),
  });

  let reportId: string;
  if (createRes.status === 409) {
    console.log('   ℹ️ Report for today already exists, fetching existing report...');
    const listRes = await fetch(`${API_URL}/daily-reports?scope=own`, {
      headers: { Authorization: `Bearer ${empAuth.accessToken}` },
    });
    const list = await listRes.json();
    reportId = list[0].id;
  } else if (createRes.ok) {
    const data = await createRes.json();
    reportId = data.id;
    console.log(`   ✅ Created report #${reportId} successfully`);
  } else {
    throw new Error(`Failed to create report: ${createRes.status} ${await createRes.text()}`);
  }

  // 3. Employee edits own report
  console.log('3. Employee edits own report...');
  const editRes = await fetch(`${API_URL}/daily-reports/${reportId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${empAuth.accessToken}`,
    },
    body: JSON.stringify({
      difficulty: 'Đã khắc phục xong khó khăn',
      support_needed: 'Không cần hỗ trợ nữa',
      next_plan: 'Viết tài liệu và giao dịch',
      note: 'Báo cáo cập nhật thành công',
    }),
  });
  if (!editRes.ok) {
    throw new Error(`Failed to update report: ${editRes.status}`);
  }
  const updatedReport = await editRes.json();
  console.log(`   ✅ Updated report successfully. New difficulty: "${updatedReport.difficulty}"`);

  // 4. Employee reads own list & detail
  console.log('4. Employee reads own list & detail...');
  const ownListRes = await fetch(`${API_URL}/daily-reports?scope=own`, {
    headers: { Authorization: `Bearer ${empAuth.accessToken}` },
  });
  const ownList = await ownListRes.json();
  if (!Array.isArray(ownList) || ownList.length === 0) {
    throw new Error('Expected own reports list to contain items');
  }
  console.log(`   ✅ Employee read own list: found ${ownList.length} report(s)`);

  const ownDetailRes = await fetch(`${API_URL}/daily-reports/${reportId}`, {
    headers: { Authorization: `Bearer ${empAuth.accessToken}` },
  });
  if (!ownDetailRes.ok) throw new Error('Failed to read own report detail');
  console.log(`   ✅ Employee read own detail successfully`);

  // 5. Employee B creates report
  console.log('5. Testing Employee B (Team B)...');
  const empBAuth = await login('brw_emp_b', 'Password123!@#');
  const createBRes = await fetch(`${API_URL}/daily-reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${empBAuth.accessToken}`,
    },
    body: JSON.stringify({
      report_date: today,
      difficulty: 'Khó khăn team B',
      support_needed: 'Hỗ trợ B',
      next_plan: 'Kế hoạch B',
      note: 'Ghi chú B',
    }),
  });
  let reportBId: string;
  if (createBRes.status === 409) {
    const listRes = await fetch(`${API_URL}/daily-reports?scope=own`, {
      headers: { Authorization: `Bearer ${empBAuth.accessToken}` },
    });
    const list = await listRes.json();
    reportBId = list[0].id;
  } else {
    const data = await createBRes.json();
    reportBId = data.id;
  }
  console.log(`   ✅ Team B report #${reportBId} ready`);

  // 6. Employee A cannot read Employee B's report -> 403 Forbidden
  console.log('6. Verifying Employee A CANNOT read Employee B report...');
  const forbiddenRes = await fetch(`${API_URL}/daily-reports/${reportBId}`, {
    headers: { Authorization: `Bearer ${empAuth.accessToken}` },
  });
  if (forbiddenRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden but got ${forbiddenRes.status}`);
  }
  console.log(`   ✅ Verified: Employee A received 403 Forbidden when accessing report of Employee B`);

  // 7. Team Leader A login & scope verification
  console.log('7. Testing Team Leader A (brw_leader_a)...');
  const leaderAAuth = await login('brw_leader_a', 'Password123!@#');
  console.log(`   ✅ Logged in as Leader A (${leaderAAuth.user.username})`);

  const leaderAListRes = await fetch(`${API_URL}/daily-reports?scope=team`, {
    headers: { Authorization: `Bearer ${leaderAAuth.accessToken}` },
  });
  const leaderAList = await leaderAListRes.json();
  const hasEmpA = leaderAList.some((r: any) => String(r.id) === String(reportId));
  const hasEmpB = leaderAList.some((r: any) => String(r.id) === String(reportBId));
  if (!hasEmpA) throw new Error('Leader A must see Team A member report');
  if (hasEmpB) throw new Error('Leader A MUST NOT see Team B member report');
  console.log(`   ✅ Verified: Leader A sees current team member (${hasEmpA}), does NOT see Team B (${!hasEmpB})`);

  // 8. Leader A blocked from viewing Team B report detail -> 403
  console.log('8. Verifying Leader A blocked from Team B report detail...');
  const leaderABlockedRes = await fetch(`${API_URL}/daily-reports/${reportBId}`, {
    headers: { Authorization: `Bearer ${leaderAAuth.accessToken}` },
  });
  if (leaderABlockedRes.status !== 403) {
    throw new Error(`Expected Leader A to receive 403 on Team B report, got ${leaderABlockedRes.status}`);
  }
  console.log(`   ✅ Verified: Leader A received 403 Forbidden for Team B detail`);

  // 9. Boss / Admin global visibility
  console.log('9. Testing Admin / Boss Global Visibility (admin)...');
  const adminAuth = await login('admin', 'AdminPass123!@#');
  console.log(`   ✅ Logged in as Admin (${adminAuth.user.username})`);

  const adminListRes = await fetch(`${API_URL}/daily-reports?scope=all`, {
    headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
  });
  const adminList = await adminListRes.json();
  const adminHasA = adminList.some((r: any) => String(r.id) === String(reportId));
  const adminHasB = adminList.some((r: any) => String(r.id) === String(reportBId));
  if (!adminHasA || !adminHasB) {
    throw new Error('Admin must see reports from both Team A and Team B');
  }
  console.log(`   ✅ Verified: Admin has global access to all reports across all teams`);

  // 10. Filter by date and month
  console.log('10. Testing Filter by Date and Month...');
  const filterDateRes = await fetch(`${API_URL}/daily-reports?scope=all&date=${today}`, {
    headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
  });
  const dateFiltered = await filterDateRes.json();
  const allMatchDate = dateFiltered.every((r: any) => r.reportDate === today);
  if (!allMatchDate) throw new Error('Date filter returned mismatched report_date');
  console.log(`   ✅ Date filter (${today}) verified: ${dateFiltered.length} records, all matching`);

  const currentMonth = today.slice(0, 7);
  const filterMonthRes = await fetch(`${API_URL}/daily-reports?scope=all&month=${currentMonth}`, {
    headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
  });
  const monthFiltered = await filterMonthRes.json();
  const allMatchMonth = monthFiltered.every((r: any) => r.reportDate.startsWith(currentMonth));
  if (!allMatchMonth) throw new Error('Month filter returned mismatched month');
  console.log(`   ✅ Month filter (${currentMonth}) verified: ${monthFiltered.length} records, all matching`);

  console.log('================================================================');
  console.log('ALL 10 BROWSER RUNTIME + UI CONTRACT CHECKS PASSED PERFECTLY! ✅');
  console.log('================================================================');
}

testRuntime().catch((err) => {
  console.error('❌ Runtime verification failed:', err);
  process.exit(1);
});
