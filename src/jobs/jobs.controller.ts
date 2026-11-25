import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/role.enum';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { CreateJobDto } from './dto/create-job.dto';
import { JobPageDto } from './dto/job-page.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { Job } from './job.entity';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly service: JobsService) {}

  @Post()
  @Roles(Role.PLANNER)
  create(@Body() dto: CreateJobDto): Promise<Job> {
    return this.service.create(dto);
  }

  // Operators also need to read jobs to find the ones they will complete.
  @Get()
  @Roles(Role.PLANNER, Role.OPERATOR)
  list(@Query() query: ListJobsQueryDto): Promise<JobPageDto> {
    return this.service.list(query);
  }

  @Get(':id')
  @Roles(Role.PLANNER, Role.OPERATOR)
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIdPipe) id: number): Promise<Job> {
    return this.service.findOne(id);
  }
}
