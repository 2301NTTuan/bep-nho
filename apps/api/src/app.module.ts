import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RecipesModule } from './recipes/recipes.module';
import { CookSessionsModule } from './cook-sessions/cook-sessions.module';
import { FeedbackModule } from './feedback/feedback.module';
import { PersonalizationModule } from './personalization/personalization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,

      envFilePath: [
        '../../.env',
        '.env',
      ],

      validationSchema: envValidationSchema,

      validationOptions: {
        abortEarly: false,
      },
    }),

    DatabaseModule,
    HealthModule,
    RecipesModule,
    CookSessionsModule,
    FeedbackModule,
    PersonalizationModule,
  ],
})
export class AppModule {}
