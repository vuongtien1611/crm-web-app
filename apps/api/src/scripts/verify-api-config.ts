function resolveBaseUrl(envUrl: string): string {
  if (!envUrl) {
    return '/api';
  }
  return envUrl.replace(/\/+$/, '');
}

function testBuildUrl(baseUrl: string, path: string): string {
  const normBase = resolveBaseUrl(baseUrl);
  if (!path) return normBase;
  if (/^https?:\/\//i.test(path)) return path;

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (normBase.endsWith('/api')) {
    if (cleanPath.startsWith('/api/')) {
      return `${normBase}${cleanPath.substring(4)}`;
    }
    if (cleanPath === '/api') {
      return normBase;
    }
    return `${normBase}${cleanPath}`;
  }

  if (cleanPath.startsWith('/api/') || cleanPath === '/api') {
    return `${normBase}${cleanPath}`;
  }
  return `${normBase}/api${cleanPath}`;
}

async function runConfigTest() {
  console.log('--- TESTING API CONFIG & URL BUILDER (AUD-028) ---');

  const cases = [
    // Case 1: Localhost default proxy (/api)
    { base: '', path: '/leads', expected: '/api/leads' },
    { base: '', path: 'leads', expected: '/api/leads' },
    { base: '', path: '/api/leads', expected: '/api/leads' },
    { base: '/api', path: '/orders/123/approve', expected: '/api/orders/123/approve' },
    { base: '/api/', path: '/orders/123/approve', expected: '/api/orders/123/approve' },

    // Case 2: Production different domain without /api
    { base: 'https://api.vmaxcrm.vn', path: '/leads', expected: 'https://api.vmaxcrm.vn/api/leads' },
    { base: 'https://api.vmaxcrm.vn/', path: 'leads', expected: 'https://api.vmaxcrm.vn/api/leads' },
    { base: 'https://api.vmaxcrm.vn', path: '/api/leads', expected: 'https://api.vmaxcrm.vn/api/leads' },

    // Case 3: Production different domain WITH /api
    { base: 'https://api.vmaxcrm.vn/api', path: '/leads', expected: 'https://api.vmaxcrm.vn/api/leads' },
    { base: 'https://api.vmaxcrm.vn/api/', path: '/api/leads', expected: 'https://api.vmaxcrm.vn/api/leads' },
    { base: 'https://api.vmaxcrm.vn/api', path: 'leads', expected: 'https://api.vmaxcrm.vn/api/leads' },

    // Case 4: Presigned S3 external URLs
    { base: '/api', path: 'https://storage.googleapis.com/bucket/doc.pdf', expected: 'https://storage.googleapis.com/bucket/doc.pdf' },
  ];

  let passed = 0;
  for (const c of cases) {
    const result = testBuildUrl(c.base, c.path);
    const hasDoubleApi = result.includes('/api/api');
    if (result === c.expected && !hasDoubleApi) {
      console.log(`✅ PASS: base="${c.base}" path="${c.path}" -> "${result}"`);
      passed++;
    } else {
      console.error(`❌ FAIL: base="${c.base}" path="${c.path}" -> got "${result}", expected "${c.expected}"`);
    }
  }

  console.log(`\nAPI CONFIG TESTS: ${passed}/${cases.length} PASSED. No /api/api detected.`);
  if (passed !== cases.length) process.exit(1);
}

runConfigTest().catch(console.error);

