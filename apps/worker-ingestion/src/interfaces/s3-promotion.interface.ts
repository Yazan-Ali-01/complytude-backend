export interface S3PromotionResult {
  bucket: string;
  key: string;
}

export interface IS3PromotionService {
  promote(sourceBucket: string, sourceKey: string): Promise<S3PromotionResult>;
}

export const S3_PROMOTION_SERVICE = Symbol('S3_PROMOTION_SERVICE');
