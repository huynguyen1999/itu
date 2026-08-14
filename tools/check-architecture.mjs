import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiCore = path.join(root, 'api/src/core');
const webShared = path.join(root, 'web/src/shared');
const sourceRoots = [path.join(root, 'api/src'), path.join(root, 'web/src'), path.join(root, 'macos/iTu'), path.join(root, 'extension')];
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.swift']);
const largeFileThreshold = 24 * 1024;
const largeFileGrowthAllowance = (size) => Math.max(1024, Math.ceil(size * 0.05));
const importPattern = /(?:from\s*|import\s*\(|require\s*\()(['"])([^'"]+)\1/g;
const violations = [];
const featureWarnings = [];

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(target));
    else files.push(target);
  }
  return files;
}

function isProductionSource(file) {
  return sourceExtensions.has(path.extname(file)) && !/\.(?:spec|test)\.[^.]+$/.test(file);
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function report(file, source, offset, message) {
  violations.push(`${path.relative(root, file)}:${lineNumber(source, offset)} ${message}`);
}

function resolvesInside(file, specifier, directory) {
  return specifier.startsWith('.') && path.resolve(path.dirname(file), specifier).startsWith(`${directory}${path.sep}`);
}

async function checkApiCore() {
  const schema = await readFile(path.join(root, 'api/prisma/schema.prisma'), 'utf8');
  const businessEnums = new Set([...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((match) => match[1]));

  for (const file of (await filesUnder(apiCore)).filter(isProductionSource)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[2];
      if (specifier.startsWith('@infrastructure/') || resolvesInside(file, specifier, path.join(root, 'api/src/infrastructure'))) {
        report(file, source, match.index, `production core imports infrastructure: ${specifier}`);
      }
    }
    for (const match of source.matchAll(/\b(?:PrismaService|PrismaClient|Prisma\.TransactionClient)\b/g)) {
      report(file, source, match.index, `production core references ${match[0]}`);
    }
    for (const match of source.matchAll(/import\s+(\{[^}]*\}|[^;\n]+)\s+from\s+['"]@prisma\/client['"]/g)) {
      const clause = match[1].trim();
      const named = clause.match(/^\{([\s\S]*)\}$/)?.[1]
        .split(',')
        .map((name) => name.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])
        .filter(Boolean);
      if (!named || named.some((name) => !businessEnums.has(name))) {
        report(file, source, match.index, 'production core may import only Prisma-generated business enums');
      }
    }
  }
}

async function checkWebShared() {
  const features = path.join(root, 'web/src/features');
  for (const file of (await filesUnder(webShared)).filter(isProductionSource)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[2];
      if (
        specifier === '@features' ||
        specifier.startsWith('@features/') ||
        specifier === '@/features' ||
        specifier.startsWith('@/features/') ||
        resolvesInside(file, specifier, features)
      ) {
        report(file, source, match.index, `shared imports a feature: ${specifier}`);
      }
    }
  }
}

async function checkWebFeatureImports() {
  const features = path.join(root, 'web/src/features');

  for (const file of (await filesUnder(features)).filter(isProductionSource)) {
    const currentFeature = path.relative(features, file).split(path.sep)[0];
    const source = await readFile(file, 'utf8');

    for (const match of source.matchAll(importPattern)) {
      const specifier = match[2];
      const targetFeature = specifier.match(/^@\/features\/([^/]+)/)?.[1];
      const targetPath = specifier.startsWith('.') && resolvesInside(file, specifier, features)
        ? path.relative(features, path.resolve(path.dirname(file), specifier)).split(path.sep)[0]
        : targetFeature;

      if (!targetPath || targetPath === currentFeature) continue;

      if (specifier !== `@/features/${targetPath}`) {
        featureWarnings.push(`${path.relative(root, file)}:${lineNumber(source, match.index)} feature imports another feature internals: ${specifier}; use @/features/${targetPath}`);
      }
    }
  }
}

async function concentrationWarnings() {
  const warnings = [];
  const baseline = JSON.parse(await readFile(path.join(root, 'tools/architecture-large-files-baseline.json'), 'utf8'));

  for (const directory of sourceRoots) {
    for (const file of (await filesUnder(directory)).filter(isProductionSource)) {
      const bytes = (await stat(file)).size;
      if (bytes <= largeFileThreshold) continue;

      const relativePath = path.relative(root, file);
      warnings.push(`${relativePath} (${Math.ceil(bytes / 1024)} KB)`);

      const baselineBytes = baseline[relativePath];
      if (baselineBytes === undefined) {
        violations.push(`${relativePath}: production file exceeds ${largeFileThreshold} bytes and is not in the large-file baseline`);
      } else if (bytes > baselineBytes + largeFileGrowthAllowance(baselineBytes)) {
        violations.push(`${relativePath}: production file grew from ${baselineBytes} to ${bytes} bytes; split responsibilities before growing it further`);
      }
    }
  }
  return warnings.sort();
}

await Promise.all([checkApiCore(), checkWebShared(), checkWebFeatureImports()]);
const warnings = await concentrationWarnings();

if (warnings.length) {
  console.warn('Architecture review warnings (>24 KB production source):');
  for (const warning of warnings) console.warn(`  - ${warning}`);
}

if (featureWarnings.length) {
  console.warn('Architecture review warnings (feature-to-feature deep imports):');
  for (const warning of featureWarnings.sort()) console.warn(`  - ${warning}`);
}

if (violations.length) {
  console.error('Architecture boundary violations:');
  for (const violation of violations.sort()) console.error(`  - ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries pass.');
}
