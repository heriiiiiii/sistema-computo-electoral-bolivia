import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { RrvClient } from './rrv.client';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, RrvClient],
})
export class DashboardModule {}
