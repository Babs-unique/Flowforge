import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationRole,
  Prisma,
  type OrganizationMember,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateOrganizationDto } from './dto/create-organization.dto.js';
import type { UpdateOrganizationDto } from './dto/update-organization.dto.js';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) {
      throw new BadRequestException(
        'Organization name must produce a valid slug',
      );
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const organization = await transaction.organization.create({
          data: { name: dto.name, slug },
        });
        await transaction.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId,
            role: OrganizationRole.OWNER,
          },
        });
        return {
          ...organization,
          role: OrganizationRole.OWNER,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An organization with this slug already exists',
        );
      }
      throw error;
    }
  }

  async list(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    return memberships.map(({ organization, role }) => ({
      ...organization,
      role,
    }));
  }

  async getMembershipForUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null> {
    return this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });
  }

  async get(organizationId: string, userId: string) {
    const membership = await this.requireMembership(organizationId, userId);
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return { ...organization, role: membership.role };
  }

  async update(
    organizationId: string,
    userId: string,
    dto: UpdateOrganizationDto,
  ) {
    await this.requireRoles(organizationId, userId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);

    try {
      return await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An organization with this slug already exists',
        );
      }
      throw error;
    }
  }

  async listMembers(organizationId: string, userId: string) {
    await this.requireMembership(organizationId, userId);
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  async changeRole(
    organizationId: string,
    memberId: string,
    userId: string,
    role: OrganizationRole,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireMembership(
        organizationId,
        userId,
        transaction,
      );
      if (
        actor.role !== OrganizationRole.OWNER &&
        actor.role !== OrganizationRole.ADMIN
      ) {
        throw new ForbiddenException(
          'You do not have permission to manage member roles',
        );
      }

      const target = await transaction.organizationMember.findFirst({
        where: { id: memberId, organizationId },
      });
      if (!target) {
        throw new NotFoundException('Organization member not found');
      }

      if (actor.role === OrganizationRole.ADMIN) {
        if (
          target.role === OrganizationRole.OWNER ||
          target.role === OrganizationRole.ADMIN ||
          role === OrganizationRole.OWNER
        ) {
          throw new ForbiddenException(
            'Administrators cannot manage owner or administrator roles',
          );
        }
        if (
          role !== OrganizationRole.MEMBER &&
          role !== OrganizationRole.ADMIN
        ) {
          throw new ForbiddenException(
            'Administrators can only assign member or administrator roles',
          );
        }
      }

      if (
        target.role === OrganizationRole.OWNER &&
        role !== OrganizationRole.OWNER
      ) {
        const ownerCount = await transaction.organizationMember.count({
          where: { organizationId, role: OrganizationRole.OWNER },
        });
        if (ownerCount <= 1) {
          throw new BadRequestException(
            'The organization must have at least one owner',
          );
        }
      }

      return transaction.organizationMember.update({
        where: { id: memberId },
        data: { role },
        select: {
          id: true,
          role: true,
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      });
    });
  }

  async removeMember(organizationId: string, memberId: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireMembership(
        organizationId,
        userId,
        transaction,
      );
      if (
        actor.role !== OrganizationRole.OWNER &&
        actor.role !== OrganizationRole.ADMIN
      ) {
        throw new ForbiddenException(
          'You do not have permission to remove members',
        );
      }

      const target = await transaction.organizationMember.findFirst({
        where: { id: memberId, organizationId },
      });
      if (!target) {
        throw new NotFoundException('Organization member not found');
      }
      if (target.id === actor.id) {
        throw new BadRequestException(
          'Use the leave organization endpoint to leave',
        );
      }
      if (
        actor.role === OrganizationRole.ADMIN &&
        target.role !== OrganizationRole.MEMBER
      ) {
        throw new ForbiddenException('Administrators can only remove members');
      }
      if (target.role === OrganizationRole.OWNER) {
        const ownerCount = await transaction.organizationMember.count({
          where: { organizationId, role: OrganizationRole.OWNER },
        });
        if (ownerCount <= 1) {
          throw new BadRequestException(
            'The organization must have at least one owner',
          );
        }
      }

      await transaction.organizationMember.delete({
        where: { id: memberId },
      });
    });
  }

  async leave(organizationId: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const membership = await this.requireMembership(
        organizationId,
        userId,
        transaction,
      );
      if (membership.role === OrganizationRole.OWNER) {
        const ownerCount = await transaction.organizationMember.count({
          where: { organizationId, role: OrganizationRole.OWNER },
        });
        if (ownerCount <= 1) {
          throw new BadRequestException(
            'Transfer ownership before leaving the organization',
          );
        }
      }
      await transaction.organizationMember.delete({
        where: { id: membership.id },
      });
    });
  }

  private async requireMembership(
    organizationId: string,
    userId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<OrganizationMember> {
    const client = transaction ?? this.prisma;
    const membership = await client.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });
    if (!membership) {
      throw new NotFoundException('Organization not found');
    }
    return membership;
  }

  private async requireRoles(
    organizationId: string,
    userId: string,
    roles: OrganizationRole[],
  ): Promise<OrganizationMember> {
    const membership = await this.requireMembership(organizationId, userId);
    if (!roles.includes(membership.role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }
    return membership;
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}
