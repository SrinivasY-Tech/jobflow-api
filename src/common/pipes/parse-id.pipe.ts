import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const PG_INT_MAX = 2_147_483_647;

/**
 * Parses a route :id into a positive Postgres `integer`.
 * Nest's built-in ParseIntPipe would accept "99999999999", and Postgres would
 * then fail with "out of range for type integer" -> a 500. Reject it as 400 here.
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^\d+$/.test(value)) throw new BadRequestException('id must be a positive integer');
    const id = Number(value);
    if (id < 1 || id > PG_INT_MAX) throw new BadRequestException('id is out of range');
    return id;
  }
}
