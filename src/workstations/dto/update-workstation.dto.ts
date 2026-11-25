import { PartialType } from '@nestjs/swagger';
import { CreateWorkstationDto } from './create-workstation.dto';

/**
 * PartialType from @nestjs/swagger (not @nestjs/mapped-types) so both the
 * validation rules and the Swagger schema are inherited, with every field optional.
 */
export class UpdateWorkstationDto extends PartialType(CreateWorkstationDto) {}
