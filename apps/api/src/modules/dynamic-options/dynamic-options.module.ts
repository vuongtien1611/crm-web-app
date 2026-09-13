import { Module } from '@nestjs/common';
import { DynamicOptionsService } from './dynamic-options.service';
import { DynamicOptionsController } from './dynamic-options.controller';

@Module({
  controllers: [DynamicOptionsController],
  providers: [DynamicOptionsService],
  exports: [DynamicOptionsService],
})
export class DynamicOptionsModule {}
