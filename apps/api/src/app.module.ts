import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RecipesModule } from './recipes/recipes.module';
import { CookSessionsModule } from './cook-sessions/cook-sessions.module';
import { FeedbackModule } from './feedback/feedback.module';
import { PersonalizationModule } from './personalization/personalization.module';
import { DevModule } from './dev/dev.module';
import { OriginGuard } from './http/origin.guard';
import { ObservabilityModule } from './observability/observability.module';
import { AdminModule } from './admin/admin.module';

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
    ObservabilityModule,
    AuthModule,
    HealthModule,
    RecipesModule,
    CookSessionsModule,
    FeedbackModule,
    PersonalizationModule,
    AdminModule,
    ...(process.env.NODE_ENV === 'production'
      ? []
      : [DevModule]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: OriginGuard,
    },
  ],
})
export class AppModule {}
