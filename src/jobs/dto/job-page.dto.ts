import { Job } from '../job.entity';

export class JobPageDto {
  items!: Job[];
  /** Total rows matching the filters (across all pages) */
  total!: number;
  page!: number;
  limit!: number;
}
