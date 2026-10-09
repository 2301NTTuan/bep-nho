import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from './admin.guard';
import { AdminRecipesController } from './admin-recipes.controller';
import { AdminRecipesService } from './admin-recipes.service';
import { AdminMediaController, PublicMediaController } from './media.controller';
import { MediaService } from './media.service';
import { RecipePublishLockService } from './recipe-publish-lock.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminRecipesController, AdminMediaController, PublicMediaController],
  providers: [AdminGuard, AdminRecipesService, MediaService, RecipePublishLockService],
  exports: [RecipePublishLockService],
})
export class AdminModule {}
