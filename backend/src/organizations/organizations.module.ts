import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrganizationMembershipGuard } from './guards/organization-membership.guard.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [JwtModule.register({}), PrismaModule, AuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationMembershipGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
