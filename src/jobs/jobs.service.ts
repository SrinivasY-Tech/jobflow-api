import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, MoreThanOrEqual, Repository } from 'typeorm';
import { CreateJobDto } from './dto/create-job.dto';
import { JobPageDto } from './dto/job-page.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { Job } from './job.entity';

@Injectable()
export class JobsService {
  constructor(@InjectRepository(Job) private readonly repo: Repository<Job>) {}

  create(dto: CreateJobDto): Promise<Job> {
    return this.repo.save(this.repo.create(dto));
  }

  /**
   * The "work queue" list: most urgent first, oldest first within a priority.
   * `id` is the final tie-breaker so ordering is deterministic. Without it,
   * rows with equal (priority, created_at) can swap between pages and show up
   * twice or not at all.
   */
  async list(query: ListJobsQueryDto): Promise<JobPageDto> {
    const where: FindOptionsWhere<Job> = {};
    if (query.status) where.status = query.status;
    if (query.minPriority) where.priority = MoreThanOrEqual(query.minPriority);

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { priority: 'DESC', createdAt: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(id: number): Promise<Job> {
    const job = await this.repo.findOneBy({ id });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }
}
