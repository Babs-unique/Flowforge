import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole, Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationsService } from './organizations.service.js';

function createMembership(
  organizationId: string,
  userId: string,
  role: OrganizationRole,
  id = 'membership-id',
) {
  return {
    id,
    organizationId,
    userId,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createPrismaMock() {
  const transaction = {
    organization: {
      create: vi.fn(),
      update: vi.fn(),
    },
    organizationMember: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  let transactionQueue = Promise.resolve();

  const prisma = {
    organization: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    organizationMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(
      async <T>(callback: (client: typeof transaction) => Promise<T>) => {
        const result = transactionQueue.then(() => callback(transaction));
        transactionQueue = result.catch(() => undefined);
        return result;
      },
    ),
  };

  return { prisma, transaction };
}

describe('OrganizationsService', () => {
  it('creates an organization and makes the creator OWNER in one transaction', async () => {
    const { prisma, transaction } = createPrismaMock();
    transaction.organization.create.mockResolvedValue({
      id: 'org-id',
      name: 'Flow Team',
      slug: 'flow-team',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    const result = await service.create('user-id', { name: 'Flow Team' });

    expect(transaction.organizationMember.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-id',
        userId: 'user-id',
        role: OrganizationRole.OWNER,
      },
    });
    expect(result.role).toBe(OrganizationRole.OWNER);
  });

  it('maps duplicate slugs to a conflict', async () => {
    const { prisma, transaction } = createPrismaMock();
    transaction.organization.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate slug', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.create('user-id', { name: 'Flow Team', slug: 'flow-team' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only organizations with the user membership', async () => {
    const { prisma } = createPrismaMock();
    prisma.organizationMember.findMany.mockResolvedValue([
      {
        role: OrganizationRole.ADMIN,
        organization: {
          id: 'org-id',
          name: 'Flow Team',
          slug: 'flow-team',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ]);
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    const result = await service.list('user-id');

    expect(prisma.organizationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-id' },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'org-id',
        role: OrganizationRole.ADMIN,
      }),
    ]);
  });

  it('rejects cross-tenant organization access', async () => {
    const { prisma } = createPrismaMock();
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    await expect(service.get('org-id', 'other-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects member organization updates', async () => {
    const { prisma } = createPrismaMock();
    prisma.organizationMember.findUnique.mockResolvedValue(
      createMembership('org-id', 'user-id', OrganizationRole.MEMBER),
    );
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.update('org-id', 'user-id', { name: 'New Name' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('protects the final owner from role demotion and leaving', async () => {
    const { prisma, transaction } = createPrismaMock();
    const owner = createMembership(
      'org-id',
      'owner-id',
      OrganizationRole.OWNER,
      'owner-membership',
    );
    transaction.organizationMember.findUnique.mockResolvedValue(owner);
    transaction.organizationMember.findFirst.mockResolvedValue(owner);
    transaction.organizationMember.count.mockResolvedValue(1);
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.changeRole(
        'org-id',
        'owner-membership',
        'owner-id',
        OrganizationRole.MEMBER,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.leave('org-id', 'owner-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lists members without exposing password hashes', async () => {
    const { prisma } = createPrismaMock();
    prisma.organizationMember.findUnique.mockResolvedValue(
      createMembership('org-id', 'user-id', OrganizationRole.MEMBER),
    );
    prisma.organizationMember.findMany.mockResolvedValue([
      {
        id: 'member-id',
        role: OrganizationRole.MEMBER,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'member-user-id',
          email: 'member@example.com',
          name: 'Member',
        },
      },
    ]);
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    const result = await service.listMembers('org-id', 'user-id');

    expect(result[0].user).not.toHaveProperty('passwordHash');
  });

  it('prevents administrators from changing owner roles', async () => {
    const { prisma, transaction } = createPrismaMock();
    transaction.organizationMember.findUnique.mockResolvedValue(
      createMembership('org-id', 'admin-id', OrganizationRole.ADMIN),
    );
    transaction.organizationMember.findFirst.mockResolvedValue(
      createMembership(
        'org-id',
        'owner-id',
        OrganizationRole.OWNER,
        'owner-membership',
      ),
    );
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.changeRole(
        'org-id',
        'owner-membership',
        'admin-id',
        OrganizationRole.MEMBER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an administrator to remove a member', async () => {
    const { prisma, transaction } = createPrismaMock();
    transaction.organizationMember.findUnique.mockResolvedValue(
      createMembership('org-id', 'admin-id', OrganizationRole.ADMIN),
    );
    transaction.organizationMember.findFirst.mockResolvedValue(
      createMembership(
        'org-id',
        'member-id',
        OrganizationRole.MEMBER,
        'target-membership',
      ),
    );
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    await service.removeMember('org-id', 'target-membership', 'admin-id');
    expect(transaction.organizationMember.delete).toHaveBeenCalledWith({
      where: { id: 'target-membership' },
    });
  });

  it('removes trailing separators after truncating a generated slug', async () => {
    const { prisma, transaction } = createPrismaMock();
    transaction.organization.create.mockResolvedValue({
      id: 'org-id',
      name: 'A'.repeat(255),
      slug: 'a'.repeat(100),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    await service.create('user-id', {
      name: `${'a'.repeat(99)}---`,
    });

    expect(transaction.organization.create).toHaveBeenCalledWith({
      data: {
        name: `${'a'.repeat(99)}---`,
        slug: 'a'.repeat(99),
      },
    });
  });

  it('allows only one of two concurrent owner departures', async () => {
    const { prisma, transaction } = createPrismaMock();
    let ownerCount = 2;
    const owners = new Map([
      [
        'owner-1',
        createMembership(
          'org-id',
          'owner-1',
          OrganizationRole.OWNER,
          'membership-1',
        ),
      ],
      [
        'owner-2',
        createMembership(
          'org-id',
          'owner-2',
          OrganizationRole.OWNER,
          'membership-2',
        ),
      ],
    ]);

    transaction.organizationMember.findUnique.mockImplementation(
      async ({
        where,
      }: {
        where: { userId_organizationId: { userId: string } };
      }) => owners.get(where.userId_organizationId.userId) ?? null,
    );
    transaction.organizationMember.count.mockImplementation(
      async () => ownerCount,
    );
    transaction.organizationMember.delete.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        const owner = [...owners.values()].find(
          (membership) => membership.id === where.id,
        );
        if (owner) {
          owners.delete(owner.userId);
          ownerCount -= 1;
        }
      },
    );
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
    );

    const results = await Promise.allSettled([
      service.leave('org-id', 'owner-1'),
      service.leave('org-id', 'owner-2'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });
});
