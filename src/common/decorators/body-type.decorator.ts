import { SetMetadata } from '@nestjs/common';

export const BodyType = (dto: any) => SetMetadata('bodyType', dto);
