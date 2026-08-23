import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { CloudBaseWorkerDispatcher } from './cloudbase-worker-dispatcher.service.js';

@Global()
@Module({
  providers: [DatabaseService, CloudBaseWorkerDispatcher],
  exports: [DatabaseService],
})
export class DatabaseModule {}
