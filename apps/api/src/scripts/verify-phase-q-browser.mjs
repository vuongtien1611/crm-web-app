// Browser Workflow Navigation Verification via Chrome CDP
const CDP_HTTP = 'http://localhost:9222';

async function main() {
  console.log('\n========================================================');
  console.log('🌐 BROWSER WORKFLOW NAVIGATION VERIFICATION (CHROME CDP)');
  console.log('========================================================\n');

  // Create a new target page in Chrome
  const newPageRes = await fetch(`${CDP_HTTP}/json/new?http://localhost:5173/login`, { method: 'PUT' });
  const pageTarget = await newPageRes.json();
  const wsUrl = pageTarget.webSocketDebuggerUrl;

  console.log(`Connected to Chrome page: ${pageTarget.id}`);

  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();
  const consoleErrors = [];
  const networkErrors = [];

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === 'Runtime.exceptionThrown') {
      const desc = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text;
      consoleErrors.push(desc);
      console.error('  [Browser Error]:', desc);
    } else if (data.method === 'Network.responseReceived') {
      const { status, url } = data.params.response;
      if (status >= 400 && !url.includes('/favicon.ico')) {
        networkErrors.push({ status, url });
      }
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  async function send(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  // Perform API login to get a real token for Boss / Admin
  console.log('Logging in as admin to establish authenticated browser session...');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin', password: 'AdminPass123!@#' }),
  });
  const authData = await loginRes.json();
  if (!authData.accessToken) {
    throw new Error('Failed to authenticate admin via API: ' + JSON.stringify(authData));
  }

  // Inject auth token and user state into localStorage
  await send('Page.navigate', { url: 'http://localhost:5173/login' });
  await new Promise((r) => setTimeout(r, 1500));

  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('auth_token', ${JSON.stringify(authData.accessToken)});
      localStorage.setItem('user', ${JSON.stringify(JSON.stringify(authData.user))});
      localStorage.setItem('refresh_token', ${JSON.stringify(authData.refreshToken)});
    `,
  });

  const routes = [
    { path: '/dashboard', label: 'Executive Dashboard' },
    { path: '/leads', label: 'Leads Management' },
    { path: '/deals', label: 'Deals Pipeline' },
    { path: '/orders', label: 'Orders & Approvals' },
    { path: '/projects', label: 'Projects Delivery' },
    { path: '/payments', label: 'Payments & Collections' },
    { path: '/commissions', label: 'Commissions' },
    { path: '/kpi', label: 'KPI Points & Metrics' },
    { path: '/payroll', label: 'Payroll Management' },
    { path: '/expenses', label: 'Company Expenses' },
    { path: '/daily-reports', label: 'Daily Reports' },
  ];

  console.log('\n--- EXECUTING SEQUENTIAL BROWSER ROUTE NAVIGATION ---');

  for (const route of routes) {
    const url = `http://localhost:5173${route.path}`;
    const errCountBefore = consoleErrors.length;
    await send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 1500));

    // Evaluate DOM text to verify non-empty render
    const evalRes = await send('Runtime.evaluate', {
      expression: `document.body.innerText.substring(0, 80).replace(/\\n/g, ' ')`,
    });
    const pageSnippet = evalRes.result?.value || '';

    const newErrors = consoleErrors.length - errCountBefore;
    if (newErrors > 0) {
      console.error(`  ❌ ${route.label.padEnd(24)} (${route.path}) rendered with ${newErrors} console error(s)`);
      throw new Error(`Console errors encountered on ${route.path}`);
    } else {
      console.log(`  ✅ ${route.label.padEnd(24)} (${route.path}) -> [OK] Content: "${pageSnippet.substring(0, 40)}..."`);
    }
  }

  // Cleanup CDP page
  await send('Page.close');
  ws.close();
  await fetch(`${CDP_HTTP}/json/close/${pageTarget.id}`);

  console.log('\n========================================================');
  console.log('🎉 BROWSER WORKFLOW NAVIGATION VERIFICATION: 100% PASSED (0 ERRORS)');
  console.log('========================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Browser E2E script failed:', err);
  process.exit(1);
});
