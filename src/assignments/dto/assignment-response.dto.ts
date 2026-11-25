import { Assignment } from '../assignment.entity';

export class AssignmentResponseDto {
  id!: number;
  jobId!: number;
  workstationId!: number;
  assignedBy!: number;
  assignedAt!: Date;
  /** null while active */
  completedAt!: Date | null;
  completedBy!: number | null;

  static from(a: Assignment): AssignmentResponseDto {
    return {
      id: a.id,
      jobId: a.jobId,
      workstationId: a.workstationId,
      assignedBy: a.assignedBy,
      assignedAt: a.assignedAt,
      completedAt: a.completedAt,
      completedBy: a.completedBy,
    };
  }
}
