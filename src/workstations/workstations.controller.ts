import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { AssignmentsService } from '../assignments/assignments.service';
import { WorkstationLoadDto } from '../assignments/dto/workstation-load.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { ALL_ROLES, Role } from '../auth/role.enum';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { CreateWorkstationDto } from './dto/create-workstation.dto';
import { UpdateWorkstationDto } from './dto/update-workstation.dto';
import { Workstation } from './workstation.entity';
import { WorkstationsService } from './workstations.service';

/** Writes are admin-only (class level); reads are opened up per method. */
@ApiTags('workstations')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('workstations')
export class WorkstationsController {
  constructor(
    private readonly service: WorkstationsService,
    private readonly assignments: AssignmentsService,
  ) {}

  @Post()
  @ApiConflictResponse({ description: 'Name already taken' })
  create(@Body() dto: CreateWorkstationDto): Promise<Workstation> {
    return this.service.create(dto);
  }

  // Planners pick a workstation when assigning; operators see where they work.
  @Get()
  @Roles(...ALL_ROLES)
  findAll(): Promise<Workstation[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIdPipe) id: number): Promise<Workstation> {
    return this.service.findOne(id);
  }

  /** Capacity, active jobs and free slots */
  @Get(':id/load')
  @Roles(...ALL_ROLES)
  @ApiNotFoundResponse()
  getLoad(@Param('id', ParseIdPipe) id: number): Promise<WorkstationLoadDto> {
    return this.assignments.getLoad(id);
  }

  @Patch(':id')
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Name taken, or capacity below current active assignments' })
  update(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateWorkstationDto,
  ): Promise<Workstation> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Workstation has assignment history; deactivate it instead' })
  remove(@Param('id', ParseIdPipe) id: number): Promise<void> {
    return this.service.remove(id);
  }
}
