import { AuthService } from './auth.service';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';

async function runAuthSecurityTests() {
  const values = new Map<string, string>();
  const expirations = new Map<string, number>();
  const redis = {
    get: async (key: string) => values.get(key) || null,
    incr: async (key: string) => {
      const next = Number(values.get(key) || 0) + 1;
      values.set(key, String(next));
      return next;
    },
    expire: async (key: string, seconds: number) => {
      expirations.set(key, seconds);
      return 1;
    },
    del: async (key: string) => values.delete(key),
  };
  const auth = new AuthService(
    { findByIdentifier: async () => null } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { client: redis } as any,
    {} as any,
  );

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await auth.login({ identifier: 'Unknown@Example.com', password: 'bad' } as any, undefined, '192.0.2.1');
      throw new Error('Invalid credentials unexpectedly accepted');
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }
  }

  try {
    await auth.login({ identifier: ' unknown@example.com ', password: 'bad' } as any, undefined, '192.0.2.1');
    throw new Error('Locked login unexpectedly accepted');
  } catch (error) {
    if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.TOO_MANY_REQUESTS) {
      throw error;
    }
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await auth.login(
        { identifier: `unknown-${attempt}@example.com`, password: 'bad' } as any,
        undefined,
        '192.0.2.2',
      );
      throw new Error('Invalid credentials unexpectedly accepted');
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }
  }
  try {
    await auth.login({ identifier: 'another@example.com', password: 'bad' } as any, undefined, '192.0.2.2');
    throw new Error('IP login rate limit was not enforced');
  } catch (error) {
    if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.TOO_MANY_REQUESTS) {
      throw error;
    }
  }

  if ([...expirations.values()].some((seconds) => seconds !== 900)) {
    throw new Error('Login attempt counters did not receive the 15-minute expiry');
  }

  console.log('Auth login lockout tests passed');
}

runAuthSecurityTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
