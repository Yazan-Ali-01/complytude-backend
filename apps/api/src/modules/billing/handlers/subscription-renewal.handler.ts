import { Injectable } from '@nestjs/common';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

/** Runs the scheduled renewal of free-plan subscriptions whose billing period has ended. */
@Injectable()
export class SubscriptionRenewalHandler {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async execute(): Promise<void> {
    await this.subscriptionsService.renewAllDuePeriods();
  }
}
