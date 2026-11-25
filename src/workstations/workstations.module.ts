import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentsModule } from '../assignments/assignments.module';
import { Workstation } from './workstation.entity';
import { WorkstationsController } from './workstations.controller';
import { WorkstationsService } from './workstations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Workstation]), AssignmentsModule],
  controllers: [WorkstationsController],
  providers: [WorkstationsService],
  exports: [WorkstationsService],
})
export class WorkstationsModule {}
