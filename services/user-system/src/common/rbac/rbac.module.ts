import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';
import { DataScopeService } from './data-scope.service.js';

@Global()
@Module({
  providers: [PermissionsService, DataScopeService],
  exports: [PermissionsService, DataScopeService],
})
export class RbacModule {}
