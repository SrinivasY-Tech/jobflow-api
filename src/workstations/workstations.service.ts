import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Assignment } from '../assignments/assignment.entity';
import { CreateWorkstationDto } from './dto/create-workstation.dto';
import { UpdateWorkstationDto } from './dto/update-workstation.dto';
import { Workstation } from './workstation.entity';

@Injectable()
export class WorkstationsService {
  constructor(
    @InjectRepository(Workstation) private readonly repo: Repository<Workstation>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * No "does this name exist?" pre-check: that would be a check-then-act race.
   * Two concurrent creates could both pass the check. The UNIQUE constraint
   * decides, and PgErrorFilter turns the violation into a 409.
   */
  create(dto: CreateWorkstationDto): Promise<Workstation> {
    return this.repo.save(this.repo.create(dto));
  }

  findAll(): Promise<Workstation[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<Workstation> {
    const ws = await this.repo.findOneBy({ id });
    if (!ws) throw new NotFoundException(`Workstation ${id} not found`);
    return ws;
  }

  /**
   * Locks the workstation row (the same lock assign() takes), so lowering
   * capacity cannot interleave with an assignment: either the assignment
   * commits first and is counted here, or it waits and sees the new capacity.
   */
  update(id: number, dto: UpdateWorkstationDto): Promise<Workstation> {
    return this.dataSource.transaction(async (em) => {
      const ws = await em
        .getRepository(Workstation)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.id = :id', { id })
        .getOne();
      if (!ws) throw new NotFoundException(`Workstation ${id} not found`);

      if (dto.capacity !== undefined && dto.capacity < ws.capacity) {
        const active = await em.count(Assignment, { where: { workstationId: id, completedAt: IsNull() } });
        if (dto.capacity < active) {
          throw new ConflictException(
            `capacity cannot be lower than the current active assignments (${active})`,
          );
        }
      }

      em.merge(Workstation, ws, dto);
      return em.save(ws);
    });
  }

  /** Workstations with assignment history are protected by FK RESTRICT -> 409. */
  async remove(id: number): Promise<void> {
    const result = await this.repo.delete({ id });
    if (result.affected === 0) throw new NotFoundException(`Workstation ${id} not found`);
  }
}
