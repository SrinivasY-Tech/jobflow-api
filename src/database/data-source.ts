import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './typeorm.config';

/**
 * Entry point for the TypeORM CLI only (migration:run / revert / show).
 * The Nest app does not import this file.
 */
export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
