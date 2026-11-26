import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnvironment } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ObserveModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const appKey = config.get<string>('OBSERVE_APP_KEY') ?? '';
        const appSecret = config.get<string>('OBSERVE_APP_SECRET') ?? '';

        return {
          enabled:
            config.getOrThrow<string>('NODE_ENV') === 'production' &&
            Boolean(appKey && appSecret),
          appKey,
          appSecret,
          serviceId: 'flowforge',
        };
      },
    }),
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
