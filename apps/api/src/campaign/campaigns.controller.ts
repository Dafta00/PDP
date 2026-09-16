import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CampaignAuthorizationService } from './authorization/campaign-authorization.service';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly campaignAuthorization: CampaignAuthorizationService,
  ) {}

  @Post()
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.findAll(user);
  }

  @Get(':campaignId')
  findOne(@Param('campaignId') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaignsService.findOne(id, user);
  }

  /** The caller's own campaign membership + effective permissions — drives permission-aware frontend nav/UI. Null membership if they have none. */
  @Get(':campaignId/me')
  async me(@Param('campaignId') campaignId: string, @CurrentUser() user: AuthenticatedUser) {
    const membership = await this.campaignAuthorization.getMembership(user.id, campaignId);
    if (!membership) return { membership: null, permissions: [] };
    const permissions = Array.from(await this.campaignAuthorization.getEffectiveCampaignPermissions(membership)).sort();
    return { membership, permissions };
  }

  @Patch(':campaignId')
  update(
    @Param('campaignId') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.update(id, dto, user);
  }
}
