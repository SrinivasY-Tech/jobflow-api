/**
 * Stored as varchar + CHECK constraint rather than a native Postgres ENUM type.
 * See README "design decisions" for the trade-off.
 */
export enum JobStatus {
  NEW = 'NEW',
  ASSIGNED = 'ASSIGNED',
  DONE = 'DONE',
}
