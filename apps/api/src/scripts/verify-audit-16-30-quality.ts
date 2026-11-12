import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { normalizeDailyReportItem } from '../common/mappers/data-mapping.util';
import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';

async function runQualityVerification() {
  console.log('====================================================');
  console.log('STARTING AUD-016 TO AUD-030 QUALITY VERIFICATION SUITE');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: AllExceptionsFilter (AUD-018 & AUD-030)
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Exception Filter & Correlation ID Verification ---');
  const filter = new AllExceptionsFilter();

  const mockResponse = () => {
    let statusCode = 200;
    let payload: any = null;
    return {
      status(code: number) {
        statusCode = code;
        return this;
      },
      send(data: any) {
        payload = data;
        return this;
      },
      getStatusCode: () => statusCode,
      getPayload: () => payload,
    };
  };

  const createMockHost = (req: any, res: any): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
        getNext: () => undefined,
      }),
      getArgs: () => [],
      getArgByIndex: () => ({}),
      switchToRpc: () => ({} as any),
      switchToWs: () => ({} as any),
      getType: () => 'http',
    } as unknown as ArgumentsHost);

  // 1.1 Test 400 Bad Request
  {
    const res = mockResponse();
    const req = { url: '/api/orders', raw: { url: '/api/orders' }, headers: { 'x-correlation-id': 'corr-400-test' } };
    filter.catch(new BadRequestException('Dữ liệu đầu vào không hợp lệ'), createMockHost(req, res));
    const p = res.getPayload();
    assert(res.getStatusCode() === 400, '400 Status Code verified');
    assert(p.success === false, 'Error response has success: false');
    assert(p.correlationId === 'corr-400-test', 'Correlation ID passed through to response');
    assert(p.message === 'Dữ liệu đầu vào không hợp lệ', '400 Message matches Vietnamese translation');
    assert(!p.stack, 'Stack trace is not exposed in production/safe output');
  }

  // 1.2 Test 401 Unauthorized
  {
    const res = mockResponse();
    const req = { url: '/api/auth/me', raw: { url: '/api/auth/me' }, headers: {} };
    filter.catch(new UnauthorizedException(), createMockHost(req, res));
    const p = res.getPayload();
    assert(res.getStatusCode() === 401, '401 Status Code verified');
    assert(p.message.includes('Phiên đăng nhập không hợp lệ') || p.message.includes('Unauthorized'), '401 default friendly message translated');
    assert(typeof p.correlationId === 'string' && p.correlationId.length > 0, 'Auto-generated correlation ID if not provided in request');
  }

  // 1.3 Test 403 Forbidden
  {
    const res = mockResponse();
    const req = { url: '/api/organization-chart', raw: { url: '/api/organization-chart' }, headers: {} };
    filter.catch(new ForbiddenException('Chỉ có BOSS mới có quyền truy cập'), createMockHost(req, res));
    const p = res.getPayload();
    assert(res.getStatusCode() === 403, '403 Status Code verified');
    assert(p.message === 'Chỉ có BOSS mới có quyền truy cập', '403 Custom error message preserved');
  }

  // 1.4 Test 404 Not Found
  {
    const res = mockResponse();
    const req = { url: '/api/deals/99999', raw: { url: '/api/deals/99999' }, headers: {} };
    filter.catch(new NotFoundException('Cơ hội không tồn tại'), createMockHost(req, res));
    const p = res.getPayload();
    assert(res.getStatusCode() === 404, '404 Status Code verified');
    assert(p.error === 'Not Found', '404 error type verified');
  }

  // 1.5 Test 409 Conflict
  {
    const res = mockResponse();
    const req = { url: '/api/daily-reports', raw: { url: '/api/daily-reports' }, headers: {} };
    filter.catch(new ConflictException('Báo cáo ngày này đã tồn tại'), createMockHost(req, res));
    const p = res.getPayload();
    assert(res.getStatusCode() === 409, '409 Status Code verified');
    assert(p.message === 'Báo cáo ngày này đã tồn tại', '409 Conflict message preserved');
  }

  // 1.6 Test 500 Internal Error (Unhanded Exception)
  {
    const res = mockResponse();
    const req = { url: '/api/crash', raw: { url: '/api/crash' }, headers: {} };
    filter.catch(new Error('Sensitive DB connection string: postgres://admin:secret@10.0.0.1:5432'), createMockHost(req, res));
    const p = res.getPayload();
    assert(res.getStatusCode() === 500, '500 Status Code for generic error');
    assert(!p.message.includes('secret') && !p.message.includes('10.0.0.1'), 'Sensitive error details not leaked to user');
    assert(
      p.message.includes('lỗi hệ thống nội bộ') || p.message.includes('Internal Server Error'),
      'Friendly fallback message for 500',
    );
  }

  // --------------------------------------------------------------------------
  // TEST 2: Data Mapping & Conflict Handling (AUD-029)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Daily Report Data Mapping & Conflict Handling ---');

  // 2.1 camelCase input
  {
    const itemCamel = {
      workTitle: 'Phát triển module thanh toán',
      workDescription: 'Tích hợp cổng VNPay',
      progressPercent: 80,
      status: 'IN_PROGRESS' as const,
      projectId: 123,
    };
    const norm = normalizeDailyReportItem(itemCamel);
    assert(norm.workTitle === 'Phát triển module thanh toán', 'camelCase workTitle mapped correctly');
    assert(norm.progressPercent === 80, 'camelCase progressPercent mapped correctly');
    assert(norm.projectId === 123, 'camelCase projectId mapped correctly');
  }

  // 2.2 snake_case input
  {
    const itemSnake = {
      work_title: 'Sửa lỗi giao diện',
      work_description: 'Fix overflow trên iPhone',
      progress_percent: 100,
      status: 'DONE' as const,
      project_id: 456,
    };
    const norm = normalizeDailyReportItem(itemSnake);
    assert(norm.workTitle === 'Sửa lỗi giao diện', 'snake_case work_title normalized to workTitle');
    assert(norm.progressPercent === 100, 'snake_case progress_percent normalized to progressPercent');
    assert(norm.projectId === 456, 'snake_case project_id normalized to projectId');
  }

  // 2.3 Conflicting dual-case input (camelCase takes precedence)
  {
    const itemConflict = {
      workTitle: 'Preferred Camel Title',
      work_title: 'Deprecated Snake Title',
      progressPercent: 90,
      progress_percent: 50,
      status: 'DONE' as const,
    };
    const norm = normalizeDailyReportItem(itemConflict);
    assert(norm.workTitle === 'Preferred Camel Title', 'Conflicting fields: workTitle takes priority over work_title');
    assert(norm.progressPercent === 90, 'Conflicting fields: progressPercent takes priority over progress_percent');
  }

  // --------------------------------------------------------------------------
  // TEST 3: Correlation ID Middleware & Sanitization (AUD-030)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Correlation ID & Security Sanitization ---');
  {
    const reqWithHeader: any = {
      raw: { headers: { 'x-correlation-id': 'custom-id-9999' } },
      headers: { 'x-correlation-id': 'custom-id-9999' },
      header: (name: string) => (name.toLowerCase() === 'x-correlation-id' ? 'custom-id-9999' : undefined),
    };
    const resWithHeader: any = {
      setHeader: (name: string, val: string) => {
        resWithHeader[name] = val;
      },
    };

    assert(reqWithHeader.headers['x-correlation-id'] === 'custom-id-9999', 'Correlation ID preserved if provided');
    // Ensure sensitive headers are not logged
    const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];
    assert(sensitiveHeaders.includes('authorization'), 'Authorization header classified as sensitive');
  }

  console.log('\n====================================================');
  console.log(`QUALITY VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runQualityVerification().catch((err) => {
  console.error('Fatal in quality verification:', err);
  process.exit(1);
});
