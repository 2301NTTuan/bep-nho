import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ListRecipesQuery } from './dto/list-recipes.query';
import { RecipesService } from './recipes.service';

@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly recipesService:
      RecipesService,
  ) {}

  @Get()
  list(
    @Query()
    query: ListRecipesQuery,
  ) {
    return this.recipesService.list(
      query.limit,
    );
  }

  @Get(':slug')
  detail(
    @Param('slug')
    slug: string,
  ) {
    return this.recipesService.detail(
      slug,
    );
  }
}
