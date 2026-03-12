import { RequestMethod } from '@nestjs/common';

export type RouteExclusion = string | { path: string; method: RequestMethod };

export interface LoggerModuleOptions {
  serviceName: string;
  excludeRoutes?: RouteExclusion[];
}
