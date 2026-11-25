import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../auth/role.enum';

export class CreateUserDto {
  /** Stored lowercase */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** 12-128 characters. The upper bound stops someone sending a 10 MB "password" to burn CPU. */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsEnum(Role)
  role!: Role;
}
