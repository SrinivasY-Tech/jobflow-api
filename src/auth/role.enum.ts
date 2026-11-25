export enum Role {
  ADMIN = 'admin',
  PLANNER = 'planner',
  OPERATOR = 'operator',
}

export const ALL_ROLES: readonly Role[] = Object.values(Role);
