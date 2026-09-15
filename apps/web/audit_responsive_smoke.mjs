import fs from 'fs';
import path from 'path';

const VIEWPORTS = [
  { name: '1920_desktop', width: 1920, height: 1080, isMobile: false },
  { name: '1366_laptop', width: 1366, height: 768, isMobile: false },
  { name: '768_tablet', width: 768, height: 1024, isMobile: true },
  { name: '390_mobile', width: 390, height: 844, isMobile: true },
];

const PAGES_TO_TEST = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/leads', label: 'Leads' },
  { path: '/deals', label: 'Deals' },
  { path: '/orders', label: 'Orders' },
  { path: '/payments', label: 'Payments' },
  { path: '/projects', label: 'Projects' },
  { path: '/expenses', label: 'Expenses' },
  { path: '/payroll', label: 'Payroll' },
];

async function runResponsiveSmoke() {
  console.log('=== STARTING RUNTIME RESPONSIVE SMOKE AUDIT ===');
  const versionRes = await fetch('http://localhost:9222/json/version');
  const versionData = await versionRes.json();
  const listRes = await fetch('http://localhost:9222/json/list');
  const pages = await listRes.json();

  let targetPage = pages.find((p) => p.type === 'page' && p.url.includes('5173'));
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
      const args = msg.params.args.map((a) => a.value || a.description).join(' ');
      if (msg.params.type === 'error') {
        consoleLogs.push({ type: msg.params.type, text: args });
      }
    } else if (msg.method === 'Network.responseReceived') {
      const status = msg.params.response.status;
      if (status >= 400) {
        networkErrors.push({ url: msg.params.response.url, status });
      }
    }
  };

  await new Promise((r) => {
    ws.onopen = r;
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  const artifactDir = '/home/vuongductien/.gemini/antigravity-ide/brain/efa580d6-53de-48df-933c-65064a0bab32';
  const reportResults = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);

    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.isMobile,
    });

    for (const page of PAGES_TO_TEST) {
      const url = `http://localhost:5173${page.path}`;
      await send('Page.navigate', { url });
      await new Promise((r) => setTimeout(r, 1200));

      // Evaluate page layout metrics
      const evalRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const body = document.body;
            const docEl = document.documentElement;
            const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
            const clientW = docEl.clientWidth;
            const hasHScroll = scrollW > clientW + 2; // Allow 2px tolerance
            const buttons = Array.from(document.querySelectorAll('button')).filter(b => {
              const rect = b.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && rect.bottom > 0;
            }).map(b => b.innerText.trim()).filter(Boolean);

            const sidebar = document.querySelector('.ant-layout-sider');
            const siderCollapsed = sidebar ? sidebar.classList.contains('ant-layout-sider-collapsed') : null;
            const siderWidth = sidebar ? sidebar.getBoundingClientRect().width : null;

            return {
              scrollW,
              clientW,
              hasHScroll,
              buttonCount: buttons.length,
              siderWidth,
              siderCollapsed,
            };
          })()
        `,
        returnByValue: true,
      });

      const metrics = evalRes.result.value;

      // Capture screenshot
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      const imgPath = path.join(artifactDir, `responsive_${vp.name}_${page.label.toLowerCase()}.png`);
      fs.writeFileSync(imgPath, Buffer.from(screenshot.data, 'base64'));

      const status = !metrics.hasHScroll ? 'PASS' : 'WARN_HSCROLL';
      console.log(`  [${vp.name}] ${page.label}: ${status} (scrollW: ${metrics.scrollW}, clientW: ${metrics.clientW}, siderWidth: ${metrics.siderWidth})`);

      reportResults.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        page: page.label,
        path: page.path,
        hasHScroll: metrics.hasHScroll,
        scrollW: metrics.scrollW,
        clientW: metrics.clientW,
        siderWidth: metrics.siderWidth,
        status,
        screenshot: `responsive_${vp.name}_${page.label.toLowerCase()}.png`,
      });
    }
  }

  // Modal smoke test on Mobile 390px
  console.log('\n--- Testing Modal Usability on Mobile (390px) ---');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send('Page.navigate', { url: 'http://localhost:5173/leads' });
  await new Promise((r) => setTimeout(r, 1500));

  // Click create button to open modal
  const clickRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tạo Lead') || b.innerText.includes('Thêm Lead') || b.innerText.includes('Tạo mới'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `,
    returnByValue: true,
  });

  await new Promise((r) => setTimeout(r, 800));

  const modalMetrics = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const modal = document.querySelector('.ant-modal');
        if (!modal) return { modalFound: false };
        const rect = modal.getBoundingClientRect();
        const submitBtn = modal.querySelector('button[type="submit"]') || Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('Lưu') || b.innerText.includes('Tạo'));
        return {
          modalFound: true,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          overflowScreen: rect.right > window.innerWidth,
          hasSubmitBtn: !!submitBtn,
        };
      })()
    `,
    returnByValue: true,
  });

  const modalShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'responsive_mobile_modal_test.png'), Buffer.from(modalShot.data, 'base64'));

  console.log('Mobile Modal Usability Result:', modalMetrics.result.value);

  console.log('\n=== SUMMARY OF RESPONSIVE RESULTS ===');
  const hscrollIssues = reportResults.filter((r) => r.hasHScroll);
  console.log(`Total Tested: ${reportResults.length}`);
  console.log(`Horizontal Scroll Issues: ${hscrollIssues.length}`);
  if (hscrollIssues.length > 0) {
    console.log('Issues found:', hscrollIssues);
  } else {
    console.log('✅ ALL VIEWPORTS (1920, 1366, 768, 390) PASSED RESPONSIVE SMOKE!');
  }

  ws.close();
}

runResponsiveSmoke().catch((err) => {
  console.error('Responsive audit error:', err);
  process.exit(1);
});
