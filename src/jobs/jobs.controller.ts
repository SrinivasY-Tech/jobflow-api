import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { AssignmentsService } from '../assignments/assignments.service';
import { AssignJobDto } from '../assignments/dto/assign-job.dto';
import { AssignmentResponseDto } from '../assignments/dto/assignment-response.dto';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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
  constructor(
    private readonly service: JobsService,
    private readonly assignments: AssignmentsService,
  ) {}

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

  @Post(':id/assign')
  @Roles(Role.PLANNER)
  @ApiNotFoundResponse({ description: 'Job or workstation not found' })
  @ApiConflictResponse({
    description: 'Job not NEW, workstation inactive or full, or the row is locked too long',
  })
  async assign(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: AssignJobDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AssignmentResponseDto> {
    return AssignmentResponseDto.from(await this.assignments.assign(id, dto.workstationId, user.id));
  }

  @Post(':id/complete')
  @Roles(Role.OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Job is not ASSIGNED' })
  async complete(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() user: AuthUser,
  ): Promise<AssignmentResponseDto> {
    return AssignmentResponseDto.from(await this.assignments.complete(id, user.id));
  }
}
