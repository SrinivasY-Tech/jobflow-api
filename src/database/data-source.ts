import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateDbEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './typeorm.config';

/**
 * Entry point for the TypeORM CLI and scripts (migration:run / revert / show,
 * create-user). The Nest app does not import this file.
 */
export default new DataSource(buildDataSourceOptions(validateDbEnv(process.env)));
