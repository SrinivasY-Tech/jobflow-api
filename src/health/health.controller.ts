import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';

export interface HealthResponse {
  status: 'ok';
  checks: { database: 'up' };
  uptimeSeconds: number;
}

@Public() // probes from Docker / load balancers don't carry tokens
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Readiness-style check: 200 only if Postgres answers a trivial query.
   * Returns 503 otherwise so a load balancer / orchestrator stops routing here.
   */
  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', checks: { database: 'down' } });
    }
    return {
      status: 'ok',
      checks: { database: 'up' },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
