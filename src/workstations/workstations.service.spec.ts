import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Workstation } from './workstation.entity';
import { WorkstationsService } from './workstations.service';

function setup(row: Partial<Workstation> | null, activeCount = 0) {
  const qb = { setLock: jest.fn(), where: jest.fn(), getOne: jest.fn().mockResolvedValue(row) };
  qb.setLock.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  const em = {
    getRepository: () => ({ createQueryBuilder: () => qb }),
    count: jest.fn().mockResolvedValue(activeCount),
    merge: jest.fn((_t: unknown, target: object, patch: object) => Object.assign(target, patch)),
    save: jest.fn((entity: object) => Promise.resolve(entity)),
  };
  const dataSource = { transaction: (cb: (em: EntityManager) => unknown) => cb(em as unknown as EntityManager) };
  const repo = { delete: jest.fn() };
  const service = new WorkstationsService(
    repo as unknown as Repository<Workstation>,
    dataSource as unknown as DataSource,
  );
  return { service, qb, em, repo };
}

describe('WorkstationsService.update', () => {
  it('takes the workstation row lock before changing it', async () => {
    const { service, qb } = setup({ id: 1, capacity: 3 });
    await service.update(1, { name: 'renamed' });
    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('refuses to lower capacity below the current active assignments', async () => {
    const { service, em } = setup({ id: 1, capacity: 5 }, 3);
    await expect(service.update(1, { capacity: 2 })).rejects.toThrow(
      new ConflictException('capacity cannot be lower than the current active assignments (3)'),
    );
    expect(em.save).not.toHaveBeenCalled();
  });

  it('allows lowering capacity down to exactly the active count', async () => {
    const { service } = setup({ id: 1, capacity: 5 }, 3);
    await expect(service.update(1, { capacity: 3 })).resolves.toMatchObject({ capacity: 3 });
  });

  it('does not count assignments when capacity is raised', async () => {
    const { service, em } = setup({ id: 1, capacity: 2 });
    await service.update(1, { capacity: 10 });
    expect(em.count).not.toHaveBeenCalled();
  });

  it('404s for an unknown workstation', async () => {
    const { service } = setup(null);
    await expect(service.update(1, { capacity: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('WorkstationsService.remove', () => {
  it('404s when nothing was deleted', async () => {
    const { service, repo } = setup(null);
    repo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove(42)).rejects.toBeInstanceOf(NotFoundException);
  });
});
