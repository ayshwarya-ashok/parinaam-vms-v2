import { Global, Module } from '@nestjs/common';
import { types } from 'pg';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config';
import { ALL_ENTITIES } from './entities';

// DATE columns come back as calendar strings, not JS Dates — a date has no
// timezone, and Date objects serialise them as midnight-UTC timestamps.
types.setTypeParser(types.builtins.DATE, (v) => v);

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        type: 'postgres' as const,
        url: config.get('DATABASE_URL'),
        entities: ALL_ENTITIES,
        // The SQL files in database/migrations are the source of truth.
        // TypeORM never creates or alters schema.
        synchronize: false,
        migrationsRun: false,
        logging: config.isDevelopment ? ['error', 'warn'] : ['error'],
        poolSize: config.get('DATABASE_POOL_SIZE'),
        extra: { max: config.get('DATABASE_POOL_SIZE') },
      }),
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
