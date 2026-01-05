import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { Ruleset } from './entities/ruleset.entity';
import { CreateRulesetDto, UpdateRulesetDto } from './dto/create-ruleset.dto';
import { RulesetRepository } from '../../repositories/rulesets/ruleset.repository';
import { AuthorityRepository } from '../../repositories/authorities/authority.repository';
import {
  CursorPaginationOptions,
  CursorPaginationResult,
} from 'src/repositories/base/repository.interface';

@Injectable()
export class RulesetsService {
  private readonly logger = new Logger(RulesetsService.name);

  constructor(
    private readonly rulesetRepository: RulesetRepository,
    private readonly authorityRepository: AuthorityRepository,
  ) {}

  async create(
    createRulesetDto: CreateRulesetDto,
    createdBy: string,
  ): Promise<Ruleset> {
    try {
      // Check if key already exists
      const existing = await this.rulesetRepository.findOne({
        filters: { key: createRulesetDto.key },
        select: ['id'],
      });

      if (existing) {
        throw new ConflictException(
          `Ruleset with key "${createRulesetDto.key}" already exists`,
        );
      }

      // Validate authority_id if provided
      if (createRulesetDto.authority_id) {
        const authorityExists = await this.authorityRepository.findById(
          createRulesetDto.authority_id,
        );

        if (!authorityExists) {
          throw new BadRequestException(
            `Authority with ID "${createRulesetDto.authority_id}" not found`,
          );
        }
      }

      const ruleset = await this.rulesetRepository.create({
        ...createRulesetDto,
        metadata: createRulesetDto.metadata || {},
        created_by: createdBy,
      });

      this.logger.log(`Created ruleset: ${createRulesetDto.key}`);
      return ruleset;
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to create ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to create ruleset');
    }
  }

  async findAll(
    authorityId?: string,
    status?: string,
    cursorOptions?: CursorPaginationOptions,
  ): Promise<CursorPaginationResult<Ruleset>> {
    try {
      const filters = {
        authority_id: authorityId,
        status: status as Ruleset['status'] | undefined,
      };
      const result = await this.rulesetRepository.findMany(
        filters,
        cursorOptions,
      );
      return result;
    } catch (error) {
      this.logger.error(`Failed to fetch rulesets: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch rulesets');
    }
  }

  async findById(id: string): Promise<Ruleset> {
    try {
      const ruleset = await this.rulesetRepository.findById(id);

      if (!ruleset) {
        throw new NotFoundException(`Ruleset with ID "${id}" not found`);
      }

      return ruleset;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch ruleset');
    }
  }

  async findByKey(key: string): Promise<Ruleset> {
    try {
      const ruleset = await this.rulesetRepository.findOne({
        filters: { key },
        select: [
          'id',
          'key',
          'name',
          'description',
          'authority_id',
          'clauses',
          'metadata',
          'version',
          'status',
          'created_by',
          'created_at',
          'updated_at',
        ],
      });

      if (!ruleset) {
        throw new NotFoundException(`Ruleset with key "${key}" not found`);
      }

      return ruleset;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch ruleset');
    }
  }

  async findByKeys(keys: string[]): Promise<Ruleset[]> {
    try {
      return this.rulesetRepository.findByKeys(keys);
    } catch (error) {
      this.logger.error(`Failed to fetch rulesets by keys: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch rulesets');
    }
  }

  async update(
    key: string,
    updateRulesetDto: UpdateRulesetDto,
  ): Promise<Ruleset> {
    try {
      const existing = await this.findByKey(key);

      if (updateRulesetDto.authority_id !== undefined) {
        // Validate authority exists
        const authorityExists = await this.authorityRepository.findById(
          updateRulesetDto.authority_id,
        );
        if (!authorityExists) {
          throw new BadRequestException(
            `Authority with ID "${updateRulesetDto.authority_id}" not found`,
          );
        }
      }

      const hasUpdates = Object.values(updateRulesetDto).some(
        (value) => value !== undefined,
      );

      if (!hasUpdates) {
        return existing;
      }

      const updated = await this.rulesetRepository.update(existing.id, {
        ...updateRulesetDto,
        metadata: updateRulesetDto.metadata,
      });

      this.logger.log(`Updated ruleset: ${key}`);
      return updated;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to update ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to update ruleset');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.rulesetRepository.deleteByKey(key);

      this.logger.log(`Deleted ruleset: ${key}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete ruleset: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete ruleset');
    }
  }
}
