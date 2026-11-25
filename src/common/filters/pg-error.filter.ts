import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Postgres SQLSTATE codes we translate into client errors.
 * https://www.postgresql.org/docs/16/errcodes-appendix.html
 */
const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  LOCK_NOT_AVAILABLE: '55P03', // lock_timeout expired
  DEADLOCK_DETECTED: '40P01',
} as const;

/** Human-friendly messages for named constraints. Unknown names get a generic message. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  uq_workstations_name: 'A workstation with this name already exists',
  ck_workstations_capacity_positive: 'capacity must be greater than 0',
  ck_jobs_priority_range: 'priority must be between 1 and 5',
  ck_jobs_status: 'status is not valid',
  uq_users_email: 'A user with this email already exists',
  ck_users_role: 'role is not valid',
  uq_assignments_active_job: 'Job already has an active assignment',
  fk_assignments_workstation:
    'Workstation has assignment history and cannot be deleted; deactivate it instead',
  fk_assignments_job: 'Job has assignment history and cannot be deleted',
};

interface PgDriverError {
  code?: string;
  constraint?: string;
}

/**
 * The database is the final guard for invariants (unique names, FKs, CHECKs).
 * When it rejects a write, return a 4xx with a clear message instead of a 500.
 * Validating in the DTO first gives nicer errors; the constraint makes it
 * impossible to get wrong even under races (two inserts of the same name).
 */
@Catch(QueryFailedError)
export class PgErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(PgErrorFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { code, constraint } = exception.driverError as PgDriverError;
    const message: string | undefined = constraint ? CONSTRAINT_MESSAGES[constraint] : undefined;

    switch (code) {
      case PG.UNIQUE_VIOLATION:
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: message ?? 'Resource already exists',
        });
        return;
      case PG.FOREIGN_KEY_VIOLATION:
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: message ?? 'Resource is referenced by other records',
        });
        return;
      case PG.LOCK_NOT_AVAILABLE:
      case PG.DEADLOCK_DETECTED:
        // Safe to retry: the transaction was rolled back and nothing changed.
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'The resource is busy (locked by another request); please retry',
        });
        return;
      case PG.CHECK_VIOLATION:
      case PG.NOT_NULL_VIOLATION:
        res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: message ?? 'Invalid value',
        });
        return;
      default:
        // Unknown DB error: log the details server-side, never leak SQL to the client.
        this.logger.error(exception.message, exception.stack);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        });
    }
  }
}
