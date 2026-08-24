import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators';
import { UuidPipe } from '../../common/pipes/uuid.pipe';
import { CreateCommunityDto, UpdateCommunityDto } from './communities.dto';
import { CommunitiesService } from './communities.service';

@ApiTags('communities')
@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communities: CommunitiesService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Beneficiary communities with per-status session counts' })
  list(@Query('includeArchived') includeArchived?: string) {
    return this.communities.list(includeArchived === 'true');
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'One community' })
  detail(@Param('id', UuidPipe) id: string) {
    return this.communities.detail(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a beneficiary community' })
  create(@CurrentUser() principal: AuthPrincipal, @Body() dto: CreateCommunityDto) {
    return this.communities.create(principal, dto);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update or archive a community (never deleted — links are history)' })
  update(@Param('id', UuidPipe) id: string, @Body() dto: UpdateCommunityDto) {
    return this.communities.update(id, dto);
  }

  @Get(':id/sessions')
  @Roles('admin')
  @ApiOperation({ summary: "The community's sessions, filterable by status" })
  sessions(@Param('id', UuidPipe) id: string, @Query('status') status?: string) {
    return this.communities.sessions(id, status);
  }
}
