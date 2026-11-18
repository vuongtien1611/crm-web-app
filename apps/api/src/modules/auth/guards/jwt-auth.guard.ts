import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RedisService } from '../../../redis/redis.service';

export interface JwtPayload {
  sub: string;
  employeeId?: string;
  sessionId?: string;
  roles?: string[];
  permissions?: string[];
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();

    if (isPublic) {
      return true;
    }

    let token: string | undefined;
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (request.query && typeof request.query === 'object') {
      token = request.query.token || request.query.access_token;
    }

    if (!token) {
      throw new UnauthorizedException('Missing or invalid Authorization header or token query');
    }

    const accessSecret = this.configService.get<string>('jwt.accessSecret') || 'default_access_secret';

    try {
      const decoded = jwt.verify(token, accessSecret) as JwtPayload;

      // Validate session in Redis if token has sessionId and sub
      if (decoded.sub && decoded.sessionId && this.redisService?.client) {
        const sessionKey = `session:${decoded.sub}:${decoded.sessionId}`;
        const exists = await this.redisService.client.exists(sessionKey);
        if (!exists) {
          throw new UnauthorizedException('Session expired or revoked');
        }
      }

      request.user = decoded;
      return true;
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
