import { Module } from '@nestjs/common';
import { CategoryRepository } from 'src/repositories/categories/category.repository';
import { DatabaseModule } from '../../database/database.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryRepository],
  exports: [CategoriesService],
})
export class CategoriesModule {}
