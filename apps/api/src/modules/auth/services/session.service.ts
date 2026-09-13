import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import * as crypto from 'crypto';

export interface SessionData {
  sessionId: string;
  userId: string;
  refreshTokenHash: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
}

@Injectable()
export class SessionService {
  private readonly defaultTtlSeconds = 7 * 24 * 60 * 60; // 7 days

  constructor(private readonly redisService: RedisService) {}

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createSession(
    userId: string,
    refreshToken: string,
    sessionId?: string,
    userAgent?: string,
    ip?: string,
    ttlSeconds?: number,
  ): Promise<string> {
    const sid = sessionId || crypto.randomUUID();
    const refreshTokenHash = this.hashToken(refreshToken);
    const ttl = ttlSeconds || this.defaultTtlSeconds;

    const sessionData: SessionData = {
      sessionId: sid,
      userId,
      refreshTokenHash,
      userAgent,
      ip,
      createdAt: new Date().toISOString(),
    };

    const redis = this.redisService.client;
    const sessionKey = `session:${userId}:${sid}`;
    const userSessionsKey = `user_sessions:${userId}`;

    await redis.set(sessionKey, JSON.stringify(sessionData), 'EX', ttl);
    await redis.sadd(userSessionsKey, sid);

    return sid;
  }

  async getSession(userId: string, sessionId: string): Promise<SessionData | null> {
    const redis = this.redisService.client;
    const sessionKey = `session:${userId}:${sessionId}`;
    const data = await redis.get(sessionKey);
    if (!data) return null;

    try {
      return JSON.parse(data) as SessionData;
    } catch {
      return null;
    }
  }

  async rotateSession(
    userId: string,
    oldSessionId: string,
    oldRefreshToken: string,
    newSessionId: string,
    newRefreshToken: string,
    userAgent?: string,
    ip?: string,
    ttlSeconds?: number,
  ): Promise<string | null> {
    const existingSession = await this.getSession(userId, oldSessionId);
    if (!existingSession) return null;

    // Verify old refresh token hash matches stored hash
    const oldHash = this.hashToken(oldRefreshToken);
    if (existingSession.refreshTokenHash !== oldHash) {
      // Security alert: Token replay! Revoke session immediately.
      await this.revokeSession(userId, oldSessionId);
      return null;
    }

    // Invalidate old session
    await this.revokeSession(userId, oldSessionId);

    // Create new session
    return this.createSession(userId, newRefreshToken, newSessionId, userAgent, ip, ttlSeconds);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const redis = this.redisService.client;
    const sessionKey = `session:${userId}:${sessionId}`;
    const userSessionsKey = `user_sessions:${userId}`;

    await redis.del(sessionKey);
    await redis.srem(userSessionsKey, sessionId);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const redis = this.redisService.client;
    const userSessionsKey = `user_sessions:${userId}`;
    const sessionIds = await redis.smembers(userSessionsKey);

    if (sessionIds.length > 0) {
      const keys = sessionIds.map((sid) => `session:${userId}:${sid}`);
      await redis.del(...keys);
    }
    await redis.del(userSessionsKey);
  }
}
