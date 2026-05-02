import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { CatalogosModule } from './catalogos/catalogos.module';
import { OficialModule } from './oficial/oficial.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [DatabaseModule, CatalogosModule, OficialModule, DashboardModule],
})
export class AppModule {}
