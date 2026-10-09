import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { AdminGuard } from './admin.guard';
import { AdminRecipesService } from './admin-recipes.service';
import {
  CreateAdminRecipeDto,
  PublishRecipeDraftDto,
  UpdateRecipeDraftDto,
} from './dto/admin-recipe.dto';
import { ApiSessionProtected } from '../openapi/decorators';

@ApiTags('Admin recipes')
@ApiSessionProtected()
@Controller('admin')
@UseGuards(SessionAuthGuard, AdminGuard)
export class AdminRecipesController {
  constructor(private readonly recipes: AdminRecipesService) {}

  @Get('recipes')
  @ApiOperation({ summary: 'List recipes and editorial state (admin only).' })
  @ApiResponse({ status: 403, description: 'Administrator access required.' })
  list() { return this.recipes.list(); }

  @Post('recipes')
  @ApiOperation({ summary: 'Reserve a recipe slug and create its first draft (admin only).' })
  create(@CurrentUser() actor: AuthenticatedIdentity, @Body() dto: CreateAdminRecipeDto) {
    return this.recipes.create(actor.userId, dto);
  }

  @Get('recipes/:recipeId')
  detail(@Param('recipeId', new ParseUUIDPipe()) recipeId: string) {
    return this.recipes.detail(recipeId);
  }

  @Post('recipes/:recipeId/drafts')
  createDraft(
    @CurrentUser() actor: AuthenticatedIdentity,
    @Param('recipeId', new ParseUUIDPipe()) recipeId: string,
  ) { return this.recipes.createDraft(actor.userId, recipeId); }

  @Get('recipe-drafts/:draftId')
  getDraft(@Param('draftId', new ParseUUIDPipe()) draftId: string) {
    return this.recipes.getDraft(draftId);
  }

  @Patch('recipe-drafts/:draftId')
  updateDraft(
    @CurrentUser() actor: AuthenticatedIdentity,
    @Param('draftId', new ParseUUIDPipe()) draftId: string,
    @Body() dto: UpdateRecipeDraftDto,
  ) { return this.recipes.updateDraft(actor.userId, draftId, dto); }

  @Post('recipe-drafts/:draftId/publish')
  publish(
    @CurrentUser() actor: AuthenticatedIdentity,
    @Param('draftId', new ParseUUIDPipe()) draftId: string,
    @Body() dto: PublishRecipeDraftDto,
  ) { return this.recipes.publish(actor.userId, draftId, dto.expectedRevision); }

  @Post('recipes/:recipeId/archive')
  archive(@Param('recipeId', new ParseUUIDPipe()) recipeId: string) {
    return this.recipes.archive(recipeId);
  }

  @Post('recipes/:recipeId/restore')
  restore(@Param('recipeId', new ParseUUIDPipe()) recipeId: string) {
    return this.recipes.restore(recipeId);
  }
}
