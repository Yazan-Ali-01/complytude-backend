import { S3Client } from '@aws-sdk/client-s3';
import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { S3Config } from './interfaces/s3-config.interface';
import { S3Service } from './s3.service';
import { S3_CLIENT } from './storage.constants';

@Global()
@Module({})
export class StorageModule {
  private static readonly logger = new Logger(StorageModule.name);

  static forRoot(): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        {
          provide: S3_CLIENT,
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const s3: S3Config = configService.get<S3Config>('storage.s3')!;

            StorageModule.logger.log(
              `Creating S3 client: region=${s3.region} endpoint=${s3.endpoint ?? 'default'}`,
            );

            const explicitCreds =
              s3.accessKeyId?.trim() && s3.secretAccessKey?.trim()
                ? {
                    accessKeyId: s3.accessKeyId,
                    secretAccessKey: s3.secretAccessKey,
                  }
                : undefined;

            return new S3Client({
              ...(s3.endpoint ? { endpoint: s3.endpoint } : {}),
              region: s3.region,
              ...(explicitCreds ? { credentials: explicitCreds } : {}),
              forcePathStyle: s3.forcePathStyle,
            });
          },
        },
        S3Service,
      ],
      exports: [S3_CLIENT, S3Service],
    };
  }
}
