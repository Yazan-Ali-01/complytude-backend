#!/usr/bin/env ts-node

/**
 * Stripe Catalog Sync CLI Command
 *
 * Manually syncs plans, add-ons, and credit packages from code constants to Stripe.
 * This replaces the automatic sync that used to run on every app startup.
 *
 * Usage:
 *   npx ts-node scripts/stripe-catalog-sync.ts
 *   pnpm stripe:sync
 *
 * Environment:
 *   Requires STRIPE_CATALOG_SYNC_ENABLED=true
 *   Requires all Stripe and database environment variables
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../apps/api/src/app.module';
import { StripeCatalogSyncService } from '../apps/api/src/modules/stripe/services/stripe-catalog-sync.service';

async function main(): Promise<void> {
  console.log('🔄 Starting Stripe catalog sync...');

  try {
    // Create NestJS application context (no HTTP server)
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    // Get the catalog sync service
    const catalogSyncService = app.get(StripeCatalogSyncService);

    // Run the sync
    const result = await catalogSyncService.syncCatalog();

    if (result.success) {
      console.log('✅ Stripe catalog sync completed successfully');
      if (result.details) {
        console.log(`   📦 Plans: ${result.details.plans}`);
        console.log(`   🔧 Add-ons: ${result.details.addons}`);
        console.log(`   💳 Credit packages: ${result.details.creditPackages}`);
      }
    } else {
      console.error('❌ Stripe catalog sync failed:', result.message);
      process.exit(1);
    }

    // Clean up
    await app.close();
    console.log('🏁 Done');
    process.exit(0);
  } catch (error) {
    console.error('💥 Fatal error during catalog sync:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the command
main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
