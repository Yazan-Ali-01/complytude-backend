import { SetMetadata } from '@nestjs/common';

export const BodyDto = (dto: any) => SetMetadata('bodyType', dto);
