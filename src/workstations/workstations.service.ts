import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateWorkstationDto } from './dto/create-workstation.dto';
import { UpdateWorkstationDto } from './dto/update-workstation.dto';
import { Workstation } from './workstation.entity';

@Injectable()
export class WorkstationsService {
  constructor(
    @InjectRepository(Workstation) private readonly repo: Repository<Workstation>,
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

  async update(id: number, dto: UpdateWorkstationDto): Promise<Workstation> {
    const ws = await this.findOne(id);
    this.repo.merge(ws, dto);
    return this.repo.save(ws);
  }

  async remove(id: number): Promise<void> {
    const result = await this.repo.delete({ id });
    if (result.affected === 0) throw new NotFoundException(`Workstation ${id} not found`);
  }
}
