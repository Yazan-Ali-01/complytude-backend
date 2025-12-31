import { Module } from '@nestjs/common';
import {
  I18nModule as NestI18nModule,
  AcceptLanguageResolver,
  I18nJsonLoader,
} from 'nestjs-i18n';
import { join } from 'path';
import { DEFAULT_LOCALE } from './i18n.constants';

@Module({
  imports: [
    NestI18nModule.forRoot({
      fallbackLanguage: DEFAULT_LOCALE,
      loader: I18nJsonLoader,
      loaderOptions: {
        path: join(__dirname, 'locales'),
      },
      resolvers: [AcceptLanguageResolver],
    }),
  ],
  exports: [NestI18nModule],
})
export class I18nModule {}
