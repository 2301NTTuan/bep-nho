import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ListRecipesQuery } from './dto/list-recipes.query';
import { RecipesService } from './recipes.service';

@ApiTags('Recipes')
@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly recipesService:
      RecipesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List published recipes.' })
  @ApiResponse({ status: 200, description: 'Published recipe summaries.' })
  list(
    @Query()
    query: ListRecipesQuery,
  ) {
    return this.recipesService.list(
      query.limit,
    );
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a published recipe and its latest version.' })
  @ApiParam({ name: 'slug', schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' } })
  @ApiResponse({ status: 200, description: 'Recipe detail.' })
  @ApiResponse({ status: 404, description: 'Recipe not found.' })
  detail(
    @Param('slug')
    slug: string,
  ) {
    return this.recipesService.detail(
      slug,
    );
  }
}
