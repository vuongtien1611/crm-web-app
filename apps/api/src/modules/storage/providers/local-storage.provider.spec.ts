import { LocalStorageProvider } from './local-storage.provider';
import { StorageController } from '../storage.controller';
import { ForbiddenException } from '@nestjs/common';

async function runLocalStorageSecurityTests() {
  const provider = new LocalStorageProvider();
  const key = 'security-test/fake.pdf';
  const url = await provider.getSignedUrl(key, 60);
  const params = new URLSearchParams(url.split('?')[1]);
  const expires = params.get('expires')!;
  const signature = params.get('signature')!;
  const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;

  if (!provider.isSignedUrlValid(key, expires, signature)) {
    throw new Error('Generated local URL signature did not validate');
  }
  if (provider.isSignedUrlValid(key, expires, tamperedSignature)) {
    throw new Error('Tampered local URL signature was accepted');
  }
  if (provider.isSignedUrlValid('security-test/other.pdf', expires, signature)) {
    throw new Error('Local URL signature was accepted for a different key');
  }
  if (provider.isSignedUrlValid(key, String(Date.now() - 1), signature)) {
    throw new Error('Expired local URL was accepted');
  }

  let traversalRejected = false;
  try {
    await provider.getSignedUrl('../outside.txt');
  } catch {
    traversalRejected = true;
  }
  if (!traversalRejected) {
    throw new Error('Path traversal key was accepted');
  }

  let served = false;
  const controller = new StorageController(
    {
      isLocalSignedUrlValid: (fileKey: string, expiry: string, sig: string) =>
        provider.isSignedUrlValid(fileKey, expiry, sig),
      getFileBuffer: async () => ({ buffer: Buffer.from('ok'), mimeType: 'text/plain', size: 2 }),
    } as any,
    {} as any,
  );
  const request = { params: { '*': key }, query: { expires, signature } };
  const response = {
    header: () => response,
    send: () => {
      served = true;
    },
  };
  await controller.serveRawFile(request as any, response as any);
  if (!served) throw new Error('Valid signed local URL was not served');

  try {
    await controller.serveRawFile(
      { params: { '*': key }, query: { expires, signature: tamperedSignature } } as any,
      response as any,
    );
    throw new Error('Controller accepted a forged local URL');
  } catch (error) {
    if (!(error instanceof ForbiddenException)) throw error;
  }

  console.log('Local storage security tests passed');
}

runLocalStorageSecurityTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
