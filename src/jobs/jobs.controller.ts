import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { CreateJobDto } from './dto/create-job.dto';
import { JobPageDto } from './dto/job-page.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { Job } from './job.entity';
import { JobsService } from './jobs.service';

// Phase 3 restricts these to the planner role; Phase 4 adds assign/complete.
@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly service: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto): Promise<Job> {
    return this.service.create(dto);
  }

  @Get()
  list(@Query() query: ListJobsQueryDto): Promise<JobPageDto> {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIdPipe) id: number): Promise<Job> {
    return this.service.findOne(id);
  }
}
