import { readdirSync } from 'node:fs';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';

describe('feature assembly', () => {
  it('keeps production behavior outside feature modules', () => {
    const root = path.resolve(process.cwd(), 'src/features');
    const productionFiles = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts'))
      .map((entry) => path.join(entry.parentPath, entry.name));

    expect(productionFiles.every((file) => file.endsWith('.module.ts'))).toBe(true);
  });

  it('wires the application composition root', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.close();
  });
});
