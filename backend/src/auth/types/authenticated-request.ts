import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.js';
import type { OrganizationMembershipContext } from '../../organizations/types/organization-request.js';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  organizationMembership?: OrganizationMembershipContext;
}
