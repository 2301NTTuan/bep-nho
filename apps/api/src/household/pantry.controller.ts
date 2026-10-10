import { Body, Controller, Delete, Get, Param, Put, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ApiSessionProtected, ApiStandardErrors } from '../openapi/decorators';
import {
  CreateHouseholdPantryItemDto,
  DeleteHouseholdPantryItemQueryDto,
  UpdateHouseholdPantryItemDto,
} from './dto/pantry.dto';
import { PantryService } from './pantry.service';

@ApiTags('Household pantry')
@ApiSessionProtected()
@UseGuards(SessionAuthGuard)
@Controller('me/household/pantry')
export class PantryController {
  constructor(private readonly pantry: PantryService) {}

  @Get()
  @ApiOperation({ summary: 'List canonical ingredients currently recorded in the household pantry.' })
  @ApiResponse({ status: 200, description: 'Pantry items ordered by canonical ingredient name and item ID.' })
  @ApiStandardErrors(401, 404)
  list(@CurrentUser() identity: AuthenticatedIdentity) {
    return this.pantry.list(identity.userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Record an absolute quantity for one canonical ingredient.',
    description: 'Units remain explicit and are never converted. A household may contain each canonical ingredient only once.',
  })
  @ApiResponse({ status: 201, description: 'Pantry item created at revision 1.' })
  @ApiStandardErrors(400, 401, 404, 409)
  create(@CurrentUser() identity: AuthenticatedIdentity, @Body() dto: CreateHouseholdPantryItemDto) {
    return this.pantry.create(identity.userId, dto);
  }

  @Put(':itemId')
  @ApiOperation({
    summary: 'Replace the mutable state of a pantry item at its expected revision.',
    description: 'A stale expectedRevision returns 409 rather than overwriting a newer household edit.',
  })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Pantry item updated and revision incremented.' })
  @ApiStandardErrors(400, 401, 404, 409)
  update(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateHouseholdPantryItemDto,
  ) {
    return this.pantry.update(identity.userId, itemId, dto);
  }

  @Delete(':itemId')
  @ApiOperation({
    summary: 'Delete a pantry item at its expected revision.',
    description: 'Deleting the pantry item does not delete its canonical Ingredient.',
  })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Pantry item deleted.' })
  @ApiStandardErrors(400, 401, 404, 409)
  delete(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('itemId') itemId: string,
    @Query() query: DeleteHouseholdPantryItemQueryDto,
  ) {
    return this.pantry.delete(identity.userId, itemId, query.expectedRevision);
  }
}
