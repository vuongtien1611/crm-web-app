import fs from 'fs';
import path from 'path';

async function main() {
  const versionRes = await fetch('http://localhost:9222/json/version');
  const versionData = await versionRes.json();
  const listRes = await fetch('http://localhost:9222/json/list');
  const pages = await listRes.json();

  let targetPage = pages.find(p => p.type === 'page' && p.url.includes('5173'));
  if (!targetPage) {
    const newTargetRes = await fetch('http://localhost:9222/json/new?http://localhost:5173/dashboard');
    targetPage = await newTargetRes.json();
  }

  const ws = new WebSocket(targetPage.webSocketDebuggerUrl);

  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  const consoleLogs = [];
  const networkErrors = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      const { resolve, reject } = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const args = msg.params.args.map(a => a.value || a.description).join(' ');
      consoleLogs.push({ type: msg.params.type, text: args });
    } else if (msg.method === 'Network.responseReceived') {
      const status = msg.params.response.status;
      if (status >= 400) {
        networkErrors.push({ url: msg.params.response.url, status });
      }
    }
  };

  await new Promise(r => { ws.onopen = r; });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  // Set viewport to 1366 x 768
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log('--- Viewport set to 1366x768 ---');

  // Ensure logged in as staging_boss
  await send('Page.navigate', { url: 'http://localhost:5173/dashboard' });
  await new Promise(r => setTimeout(r, 2000));

  // Check if redirected to login
  const currentUrlResult = await send('Runtime.evaluate', { expression: 'window.location.pathname' });
  const currentPath = currentUrlResult.result.value;
  console.log('Current Path:', currentPath);

  if (currentPath === '/login') {
    console.log('Logging in as staging_boss...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const uInput = document.querySelector('input#username') || document.querySelector('input[placeholder*="tên"], input[type="text"]');
          const pInput = document.querySelector('input#password') || document.querySelector('input[type="password"]');
          if (uInput) {
            uInput.value = 'staging_boss';
            uInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (pInput) {
            pInput.value = 'Password123!';
            pInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const btn = document.querySelector('button[type="submit"]') || document.querySelector('button.ant-btn-primary');
          if (btn) btn.click();
        })()
      `,
    });
    await new Promise(r => setTimeout(r, 2500));
  }

  const pagesToAudit = [
    { name: 'Dashboard', url: '/dashboard' },
    { name: 'Leads', url: '/leads' },
    { name: 'Deals', url: '/deals' },
    { name: 'Orders', url: '/orders' },
    { name: 'Projects', url: '/projects' },
    { name: 'Payments', url: '/payments' },
    { name: 'Commissions', url: '/commissions' },
    { name: 'KPI', url: '/kpi' },
    { name: 'Payroll', url: '/payroll' },
    { name: 'Expenses', url: '/expenses' },
    { name: 'Reports', url: '/reports' },
    { name: 'Employees', url: '/employees' },
    { name: 'Teams', url: '/teams' },
    { name: 'Organization Chart', url: '/organization-chart' },
    { name: 'Acquisition', url: '/acquisition' },
    { name: 'Notifications', url: '/notifications' },
    { name: 'Employee Accounts', url: '/employee-accounts' },
    { name: 'Finance Overview', url: '/finance/overview' },
    { name: 'Finance Receivables', url: '/finance/receivables' },
    { name: 'Finance Cashflow', url: '/finance/cashflow' },
    { name: 'Finance Expenses', url: '/finance/expenses' },
  ];

  const results = [];

  const rawEnumRegex = /\b(PENDING_APPROVAL|IN_PROGRESS|FULLY_PAID|PARTIALLY_PAID|UNPAID|PENDING_CONFIRMATION|CONFIRMED|READY_FOR_ASSIGNMENT|READY_TO_START|NOT_POTENTIAL|UNCLASSIFIED|NEED_MORE_INFO)\b/g;

  for (const page of pagesToAudit) {
    console.log(`Auditing ${page.name} (${page.url})...`);
    consoleLogs.length = 0;
    networkErrors.length = 0;

    await send('Page.navigate', { url: `http://localhost:5173${page.url}` });
    await new Promise(r => setTimeout(r, 1800));

    // Evaluate page DOM
    const evalRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText || '';
          const tables = Array.from(document.querySelectorAll('table')).map(t => {
            const headers = Array.from(t.querySelectorAll('th')).map(th => th.innerText.trim());
            const rows = t.querySelectorAll('tbody tr').length;
            return { headers, rowCount: rows };
          });
          const hasEmpty = document.querySelectorAll('.ant-empty').length > 0;
          const hasModal = document.querySelectorAll('.ant-modal').length > 0;
          const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
          
          // Check horizontal scrollbar
          const hasHScroll = document.documentElement.scrollWidth > window.innerWidth;

          return {
            title: document.title,
            textLength: bodyText.length,
            tables,
            hasEmpty,
            buttonCount: buttons.length,
            buttons: buttons.slice(0, 10),
            hasHScroll,
            bodySnippet: bodyText.slice(0, 500)
          };
        })()
      `,
      returnByValue: true,
    });

    const pageData = evalRes.result?.value || {};

    // Check raw enums in text
    const textEval = await send('Runtime.evaluate', {
      expression: `document.body.innerText`,
      returnByValue: true
    });
    const fullText = textEval.result?.value || '';
    const rawMatches = Array.from(new Set(fullText.match(rawEnumRegex) || []));

    // Capture screenshot
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    const screenshotName = `audit_${page.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
    const screenshotPath = path.resolve(process.env.HOME, `.gemini/antigravity-ide/brain/efa580d6-53de-48df-933c-65064a0bab32/${screenshotName}`);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    results.push({
      page: page.name,
      url: page.url,
      tables: pageData.tables,
      hasHScroll: pageData.hasHScroll,
      buttons: pageData.buttons,
      rawEnumsFound: rawMatches,
      consoleErrors: consoleLogs.filter(l => l.type === 'error').map(l => l.text),
      networkErrors: [...networkErrors],
      screenshot: screenshotPath,
    });
  }

  console.log('--- AUDIT RESULTS START ---');
  console.log(JSON.stringify(results, null, 2));
  console.log('--- AUDIT RESULTS END ---');

  ws.close();
}

main().catch(console.error);
