import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateWorkstationDto {
  /** Unique display name */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  /** Maximum concurrent active assignments */
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;

  /** Defaults to true */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
