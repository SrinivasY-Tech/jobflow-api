import { Module } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';

/**
 * Has no controller: the routes live where clients expect them
 * (POST /jobs/:id/assign, GET /workstations/:id/load). The service uses the
 * DataSource directly because every operation needs a transaction across
 * jobs, workstations and assignments.
 */
@Module({
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
