import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

const VIETNAMESE_STATUS_MAP: Record<number, string> = {
  400: 'Yêu cầu không hợp lệ hoặc dữ liệu không đúng định dạng',
  401: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy tài nguyên yêu cầu.',
  409: 'Dữ liệu bị trùng lặp hoặc xung đột trạng thái.',
  422: 'Dữ liệu không thể xử lý theo quy tắc nghiệp vụ.',
  429: 'Quá nhiều yêu cầu. Vui lòng thử lại sau giây lát.',
  500: 'Đã xảy ra lỗi hệ thống nội bộ. Vui lòng thử lại sau.',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const correlationId =
      (request as any)?.correlationId ||
      (request?.headers?.['x-correlation-id'] as string) ||
      'N/A';
    const path = request?.raw?.url || request?.url || '';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'Đã xảy ra lỗi hệ thống nội bộ. Vui lòng thử lại sau.';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        error = exception.name || HttpStatus[status] || 'Error';
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        error = resObj.error || exception.name || HttpStatus[status] || 'Error';

        if (Array.isArray(resObj.message)) {
          // ValidationPipe errors
          details = resObj.message;
          message = resObj.message.join('; ');
        } else if (typeof resObj.message === 'string') {
          message = resObj.message;
        } else {
          message = VIETNAMESE_STATUS_MAP[status] || 'Lỗi xử lý yêu cầu';
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `[${correlationId}] Unhandled exception: ${exception.message}`,
        exception.stack,
      );
      // Redact internal error message to prevent database/credential leakage
      message = 'Đã xảy ra lỗi hệ thống nội bộ. Vui lòng thử lại sau hoặc liên hệ quản trị viên.';
      if (process.env.NODE_ENV === 'development') {
        details = { debugHint: exception.message };
      }
    }

    // Structured log for error tracking without sensitive data
    this.logger.warn(
      JSON.stringify({
        correlationId,
        statusCode: status,
        error,
        message,
        path,
        timestamp: new Date().toISOString(),
      }),
    );

    // Return unified backward-compatible error response
    // Compatible with frontend expecting:
    // 1. error.message
    // 2. error.statusCode
    // 3. packages/shared ApiResponse error format: { success: false, error: { code, message, details }, timestamp }
    const errorBody = {
      statusCode: status,
      error,
      message,
      details,
      timestamp: new Date().toISOString(),
      path,
      correlationId,
      success: false,
    };

    response.status(status).send(errorBody);
  }
}

