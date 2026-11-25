import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Status is intentionally not accepted: every job starts as NEW and only
 * moves through the assign/complete endpoints (Phase 4).
 */
export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  /** 1 (lowest) to 5 (most urgent). Defaults to 3. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;
}
