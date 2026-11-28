import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { OrganizationRole } from '../../generated/prisma/client.js';
import type { OrganizationRequest } from '../types/organization-request.js';

export const ORGANIZATION_ROLES_KEY = 'organization_roles';

export const OrganizationRoles = (...roles: OrganizationRole[]) =>
  SetMetadata(ORGANIZATION_ROLES_KEY, roles);

export const OrganizationMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();
    if (!request.organizationMembership) {
      throw new UnauthorizedException();
    }
    return request.organizationMembership;
  },
);
