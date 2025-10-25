import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

interface SwaggerDownloadOptions {
  baseUrl: string;
  outputPath: string;
  compareWithPrevious?: boolean;
}

export class SwaggerDownloader {
  /**
   * Download Swagger JSON from the running server
   */
  static async download(options: SwaggerDownloadOptions): Promise<any> {
    const { baseUrl, outputPath, compareWithPrevious = false } = options;

    console.log('📥 Downloading Swagger JSON...');

    try {
      // Download the swagger JSON
      const swaggerJson = await this.fetchSwaggerJson(baseUrl);

      // Validate OpenAPI structure
      this.validateOpenAPIStructure(swaggerJson);

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Compare with previous version if requested
      if (compareWithPrevious && fs.existsSync(outputPath)) {
        await this.compareVersions(outputPath, swaggerJson);
      }

      // Save to file
      fs.writeFileSync(outputPath, JSON.stringify(swaggerJson, null, 2));
      console.log(`✅ Swagger JSON saved to: ${outputPath}`);

      return swaggerJson;
    } catch (error) {
      console.error('❌ Failed to download Swagger JSON:', error);
      throw error;
    }
  }

  /**
   * Fetch Swagger JSON from server
   */
  private static async fetchSwaggerJson(baseUrl: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${baseUrl}/docs-json`;

      http
        .get(url, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (error) {
              reject(new Error(`Failed to parse Swagger JSON: ${error}`));
            }
          });
        })
        .on('error', (error) => {
          reject(new Error(`Failed to fetch Swagger JSON: ${error.message}`));
        });
    });
  }

  /**
   * Validate OpenAPI 3.0 structure
   */
  private static validateOpenAPIStructure(swagger: any): void {
    if (!swagger.openapi) {
      throw new Error('Invalid Swagger: missing openapi version');
    }

    if (!swagger.openapi.startsWith('3.')) {
      throw new Error(`Expected OpenAPI 3.x, got: ${swagger.openapi}`);
    }

    if (!swagger.info) {
      throw new Error('Invalid Swagger: missing info section');
    }

    if (!swagger.paths) {
      throw new Error('Invalid Swagger: missing paths section');
    }

    console.log(`✅ Valid OpenAPI ${swagger.openapi} specification`);
    console.log(`   Title: ${swagger.info.title}`);
    console.log(`   Version: ${swagger.info.version}`);
    console.log(`   Endpoints: ${Object.keys(swagger.paths).length}`);
  }

  /**
   * Compare with previous version to detect breaking changes
   */
  private static async compareVersions(
    previousPath: string,
    newSwagger: any,
  ): Promise<void> {
    try {
      const previousSwagger = JSON.parse(
        fs.readFileSync(previousPath, 'utf-8'),
      );

      const changes = this.detectChanges(previousSwagger, newSwagger);

      if (changes.length > 0) {
        console.log('\n⚠️  API Changes Detected:');
        changes.forEach((change) => console.log(`   - ${change}`));
        console.log('');
      } else {
        console.log('✅ No API changes detected');
      }
    } catch (error) {
      console.warn('⚠️  Could not compare with previous version:', error);
    }
  }

  /**
   * Detect changes between two Swagger specifications
   */
  private static detectChanges(oldSwagger: any, newSwagger: any): string[] {
    const changes: string[] = [];

    // Check for removed endpoints
    const oldPaths = Object.keys(oldSwagger.paths || {});
    const newPaths = Object.keys(newSwagger.paths || {});

    const removedPaths = oldPaths.filter((path) => !newPaths.includes(path));
    const addedPaths = newPaths.filter((path) => !oldPaths.includes(path));

    removedPaths.forEach((path) => {
      changes.push(`REMOVED: ${path}`);
    });

    addedPaths.forEach((path) => {
      changes.push(`ADDED: ${path}`);
    });

    // Check for version changes
    if (oldSwagger.info?.version !== newSwagger.info?.version) {
      changes.push(
        `VERSION: ${oldSwagger.info?.version} → ${newSwagger.info?.version}`,
      );
    }

    return changes;
  }
}

/**
 * CLI entry point
 */
export async function downloadSwaggerCLI(): Promise<void> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const outputPath =
    process.env.SWAGGER_OUTPUT ||
    path.join(__dirname, '../swagger/swagger.json');

  try {
    await SwaggerDownloader.download({
      baseUrl,
      outputPath,
      compareWithPrevious: true,
    });

    process.exit(0);
  } catch (error) {
    console.error('Failed to download Swagger:', error);
    process.exit(1);
  }
}

// Allow direct execution
if (require.main === module) {
  downloadSwaggerCLI();
}
