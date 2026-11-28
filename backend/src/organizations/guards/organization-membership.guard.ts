import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrganizationRole } from '../../generated/prisma/client.js';
import type { OrganizationRequest } from '../types/organization-request.js';
import { ORGANIZATION_ROLES_KEY } from '../decorators/organization-membership.decorator.js';
import { OrganizationsService } from '../organizations.service.js';

@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();
    const organizationId = request.params?.organizationId;
    if (typeof organizationId !== 'string') {
      throw new NotFoundException('Organization not found');
    }

    const membership = await this.organizations.getMembershipForUser(
      organizationId,
      request.user.id,
    );
    if (!membership) {
      throw new NotFoundException('Organization not found');
    }

    const allowedRoles = this.reflector.getAllAndOverride<
      OrganizationRole[] | undefined
    >(ORGANIZATION_ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    request.organizationMembership = {
      organizationId,
      membershipId: membership.id,
      userId: membership.userId,
      role: membership.role,
    };
    return true;
  }
}
