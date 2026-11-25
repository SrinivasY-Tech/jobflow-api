import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/auth-user';
import { ALL_ROLES, Role } from '../auth/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiConflictResponse({ description: 'Email already registered' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.service.create(dto));
  }

  /** The caller's own profile, resolved from the token's `sub` claim */
  @Get('me')
  @Roles(...ALL_ROLES)
  async me(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.service.findById(user.id));
  }
}
