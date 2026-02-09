import { Module } from '@nestjs/common';
import {
  AcceptLanguageResolver,
  CookieResolver,
  HeaderResolver,
  I18nModule as NestI18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';

@Module({
  imports: [
    NestI18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        // __dirname in compiled code: dist/apps/api/apps/api/src/i18n
        // Locales copied by nest-cli.json to: dist/apps/api/i18n/locales
        // So we need to go up 4 levels: ../../../.. to reach dist/apps/api/
        path: path.join(__dirname, '..', '..', '..', '..', 'i18n', 'locales'),
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
