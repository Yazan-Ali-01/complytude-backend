import { SetMetadata } from '@nestjs/common';

export const USAGE_FEATURE_KEY = 'usage_feature';
export const CREDITS_REQUIRED_KEY = 'credits_required';

export const RequireUsage = (featureKey: string, creditsRequired: number = 1) => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    SetMetadata(USAGE_FEATURE_KEY, featureKey)(target, propertyKey, descriptor);
    SetMetadata(CREDITS_REQUIRED_KEY, creditsRequired)(target, propertyKey, descriptor);
  };
};
