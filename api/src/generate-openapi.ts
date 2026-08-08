import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

console.log('Script starting...');

async function generateOpenApi() {
  console.log('Inside generateOpenApi');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: ['error', 'warn'] }
  );

  const config = new DocumentBuilder()
    .setTitle('iTu API')
    .setDescription('Authoritative REST contract for iTu productivity & learning system')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outputDir = path.resolve(__dirname, '../openapi');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');

  console.log(`Successfully generated OpenAPI spec at: ${outputPath}`);
  await app.close();
}

generateOpenApi().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err?.stack || err);
  process.exit(1);
});
