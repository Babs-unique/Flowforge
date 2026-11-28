import type { OrganizationRole } from '../../generated/prisma/client.js';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request.js';

export interface OrganizationMembershipContext {
  organizationId: string;
  membershipId: string;
  userId: string;
  role: OrganizationRole;
}

export interface OrganizationRequest extends AuthenticatedRequest {
  organizationMembership: OrganizationMembershipContext;
}
