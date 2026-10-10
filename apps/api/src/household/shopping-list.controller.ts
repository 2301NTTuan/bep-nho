import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ApiSessionProtected, ApiStandardErrors } from '../openapi/decorators';
import { ShoppingListService } from './shopping-list.service';

@ApiTags('Household shopping lists')
@ApiSessionProtected()
@UseGuards(SessionAuthGuard)
@Controller('me/household/shopping-lists')
export class ShoppingListController {
  constructor(private readonly shoppingLists: ShoppingListService) {}

  @Get(':shoppingListId')
  @ApiOperation({
    summary: 'Read one immutable household shopping-list snapshot.',
    description: 'Access is derived from current household membership; creator provenance does not grant access.',
  })
  @ApiParam({ name: 'shoppingListId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Owner-scoped immutable shopping list.' })
  @ApiStandardErrors(401, 404)
  get(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('shoppingListId') shoppingListId: string,
  ) {
    return this.shoppingLists.get(identity.userId, shoppingListId);
  }
}
