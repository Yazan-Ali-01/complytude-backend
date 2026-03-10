import { Module } from '@nestjs/common';
import {
  AcceptLanguageResolver,
  CookieResolver,
  HeaderResolver,
  I18nModule as NestI18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';
import { SupportedLanguages } from './i18n.types';

@Module({
  imports: [
    NestI18nModule.forRoot({
      fallbackLanguage: SupportedLanguages.ENGLISH,
      loaderOptions: {
        path: path.join(__dirname, 'i18n', 'locales'),
        watch: process.env.NODE_ENV !== 'production',
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        new CookieResolver(['lang', 'language']),
        new HeaderResolver(['x-lang']),
        AcceptLanguageResolver,
      ],
    }),
  ],
})
export class I18nModule {}
