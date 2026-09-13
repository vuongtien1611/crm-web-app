import { Module, Global } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { KyselyModule } from '../../database/kysely.module';

@Global()
@Module({
  imports: [KyselyModule],
  controllers: [StorageController],
  providers: [StorageService, LocalStorageProvider],
  exports: [StorageService],
})
export class StorageModule {}
