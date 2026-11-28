import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { OrganizationMembershipGuard } from './guards/organization-membership.guard.js';
import { OrganizationRoles } from './decorators/organization-membership.decorator.js';
import { OrganizationsService } from './organizations.service.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import { ChangeMemberRoleDto } from './dto/change-member-role.dto.js';
import { OrganizationRole } from '../generated/prisma/client.js';

@Controller('organizations')
@UseGuards(AccessTokenGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizations.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.list(user.id);
  }

  @Get(':organizationId')
  @UseGuards(OrganizationMembershipGuard)
  get(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.get(organizationId, user.id);
  }

  @Patch(':organizationId')
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @UseGuards(OrganizationMembershipGuard)
  update(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.update(organizationId, user.id, dto);
  }

  @Get(':organizationId/members')
  @UseGuards(OrganizationMembershipGuard)
  listMembers(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizations.listMembers(organizationId, user.id);
  }

  @Patch(':organizationId/members/:memberId/role')
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @UseGuards(OrganizationMembershipGuard)
  changeRole(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeMemberRoleDto,
  ) {
    return this.organizations.changeRole(
      organizationId,
      memberId,
      user.id,
      dto.role,
    );
  }

  @Delete(':organizationId/members/me')
  @UseGuards(OrganizationMembershipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.organizations.leave(organizationId, user.id);
  }

  @Delete(':organizationId/members/:memberId')
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @UseGuards(OrganizationMembershipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.organizations.removeMember(organizationId, memberId, user.id);
  }
}
