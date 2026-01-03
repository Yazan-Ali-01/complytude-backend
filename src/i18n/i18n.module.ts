import { Global, Module } from '@nestjs/common';
import { I18nModule as NestI18nModule } from 'nestjs-i18n';
import * as path from 'path';

@Module({
  imports: [
    NestI18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, '../i18n/locales/'),
        watch: true,
      },
    }),
  ],
})
export class I18nModule {}
