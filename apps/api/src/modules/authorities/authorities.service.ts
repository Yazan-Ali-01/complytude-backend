import { OffsetPaginationOptions, OffsetPaginationResult } from '@lib/database';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import {
  AuthorityFilters,
  AuthorityRepository,
} from '../../repositories/authorities/authority.repository';
import { AuthoritiesI18n } from './constants/i18n.constants';
import {
  CreateAuthorityDto,
  UpdateAuthorityDto,
} from './dto/create-authority.dto';
import { Authority } from './entities/authority.entity';

@Injectable()
export class AuthoritiesService {
  private readonly logger = new Logger(AuthoritiesService.name);

  constructor(
    private readonly authorityRepository: AuthorityRepository,
    private readonly i18n: I18nService,
  ) {}

  async create(createAuthorityDto: CreateAuthorityDto): Promise<Authority> {
    try {
      const existing = await this.authorityRepository.findOne({
        filters: { code: createAuthorityDto.code.toUpperCase() },
        select: ['id'],
      });

      if (existing) {
        throw new ConflictException(
          this.i18n.t(AuthoritiesI18n.errors.AUTHORITY_ALREADY_EXISTS, {
            args: { code: createAuthorityDto.code },
          }),
        );
      }

      const authority =
        await this.authorityRepository.create(createAuthorityDto);

      this.logger.log(`Created authority: ${authority.code}`);
      return authority;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Failed to create authority: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(AuthoritiesI18n.errors.AUTHORITY_CREATE_FAILED),
      );
    }
  }

  async findAll(
    filters: AuthorityFilters = {},
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
  ): Promise<OffsetPaginationResult<Authority>> {
    try {
      return await this.authorityRepository.findMany(filters, pagination);
    } catch (error) {
      this.logger.error(`Failed to fetch authorities: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(AuthoritiesI18n.errors.AUTHORITIES_FETCH_FAILED),
      );
    }
  }

  async findById(id: string): Promise<Authority> {
    try {
      const authority = await this.authorityRepository.findById(id);

      if (!authority) {
        throw new NotFoundException(
          this.i18n.t(AuthoritiesI18n.errors.AUTHORITY_NOT_FOUND_BY_ID, {
            args: { id },
          }),
        );
      }

      return authority;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch authority: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(AuthoritiesI18n.errors.AUTHORITY_FETCH_FAILED),
      );
    }
  }

  async findByCode(code: string): Promise<Authority> {
    try {
      const authority = await this.authorityRepository.findOne({
        filters: { code: code.toUpperCase() },
        select: ['id', 'code', 'name', 'description', 'country', 'is_active'],
      });

      if (!authority) {
        throw new NotFoundException(
          this.i18n.t(AuthoritiesI18n.errors.AUTHORITY_NOT_FOUND_BY_CODE, {
            args: { code },
          }),
        );
      }

      return authority;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch authority: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(AuthoritiesI18n.errors.AUTHORITY_FETCH_FAILED),
      );
    }
  }

  async update(
    id: string,
    updateAuthorityDto: UpdateAuthorityDto,
  ): Promise<Authority> {
    try {
      await this.findById(id);
      const authority = await this.authorityRepository.update(id, {
        ...updateAuthorityDto,
        updated_at: new Date(),
      });

      this.logger.log(`Updated authority: ${id}`);
      return authority;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update authority: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(AuthoritiesI18n.errors.AUTHORITY_UPDATE_FAILED),
      );
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.findById(id);

      const deleted = await this.authorityRepository.delete(id);
      if (deleted === 0) {
        throw new NotFoundException(
          this.i18n.t(AuthoritiesI18n.errors.AUTHORITY_NOT_FOUND_BY_ID, {
            args: { id },
          }),
        );
      }

      this.logger.log(`Deleted authority: ${id}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete authority: ${error.message}`);
      throw new InternalServerErrorException(
        this.i18n.t(AuthoritiesI18n.errors.AUTHORITY_DELETE_FAILED),
      );
    }
  }
}
