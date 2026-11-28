import { IsEnum } from 'class-validator';
import { OrganizationRole } from '../../generated/prisma/client.js';

export class ChangeMemberRoleDto {
  @IsEnum(OrganizationRole)
  role!: OrganizationRole;
}
