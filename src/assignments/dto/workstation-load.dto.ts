export class ActiveJobDto {
  assignmentId!: number;
  jobId!: number;
  title!: string;
  priority!: number;
  assignedAt!: Date;
}

export class WorkstationLoadDto {
  workstationId!: number;
  name!: string;
  isActive!: boolean;
  capacity!: number;
  /** Number of assignments not yet completed */
  activeAssignments!: number;
  /** capacity - activeAssignments (never negative) */
  available!: number;
  /** Active jobs, oldest assignment first */
  jobs!: ActiveJobDto[];
}
