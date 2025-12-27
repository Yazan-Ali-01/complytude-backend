import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Authority } from './entities/authority.entity';
import {
  CreateAuthorityDto,
  UpdateAuthorityDto,
} from './dto/create-authority.dto';
import { AuthorityRepository } from '../../repositories/authorities/authority.repository';

@Injectable()
export class AuthoritiesService {
  private readonly logger = new Logger(AuthoritiesService.name);

  constructor(private readonly authorityRepository: AuthorityRepository) {}

  async create(createAuthorityDto: CreateAuthorityDto): Promise<Authority> {
    try {
      // Check if code already exists
      const existing = await this.authorityRepository.findByCode(
        createAuthorityDto.code,
      );

      if (existing) {
        throw new ConflictException(
          `Authority with code "${createAuthorityDto.code}" already exists`,
        );
      }

      const authority =
        await this.authorityRepository.createAuthority(createAuthorityDto);

      this.logger.log(`Created authority: ${authority.code}`);
      return authority;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Failed to create authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to create authority');
    }
  }

  async findAll(activeOnly?: string): Promise<Authority[]> {
    try {
      return this.authorityRepository.findAllAuthorities(activeOnly);
    } catch (error) {
      this.logger.error(`Failed to fetch authorities: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch authorities');
    }
  }

  async findById(id: string): Promise<Authority> {
    try {
      const authority = await this.authorityRepository.findById(id);

      if (!authority) {
        throw new NotFoundException(`Authority with ID "${id}" not found`);
      }

      return authority;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch authority');
    }
  }

  async findByCode(code: string): Promise<Authority> {
    try {
      const authority = await this.authorityRepository.findByCode(code);

      if (!authority) {
        throw new NotFoundException(`Authority with code "${code}" not found`);
      }

      return authority;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch authority');
    }
  }

  async update(
    id: string,
    updateAuthorityDto: UpdateAuthorityDto,
  ): Promise<Authority> {
    try {
      await this.findById(id);

      const authority = await this.authorityRepository.updateAuthority(
        id,
        updateAuthorityDto,
      );

      this.logger.log(`Updated authority: ${id}`);
      return authority;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to update authority');
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.findById(id);

      await this.authorityRepository.delete(id);

      this.logger.log(`Deleted authority: ${id}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete authority: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete authority');
    }
  }
}
