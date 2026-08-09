import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resolveMediaStoragePath } from '@infrastructure/media/local-media-storage';

const confirmed = process.argv.includes('--confirm-journal-reset');
const environment = process.env.NODE_ENV ?? '';
if (!['development', 'test'].includes(environment)) throw new Error('Journal reset is limited to development/test environments');

async function main() {
  const prisma = new PrismaClient();
  const mediaRoot = path.resolve(process.env.MEDIA_ROOT ?? './media');
  try {
  const [entries, attachments, revisions, templates, tags, attachmentRows] = await Promise.all([
    prisma.journalEntry.count(),
    prisma.journalAttachment.count(),
    prisma.journalEntryRevision.count(),
    prisma.journalTemplate.count(),
    prisma.journalTag.count(),
    prisma.journalAttachment.findMany({ select: { storageKey: true } }),
  ]);
  const storageKeys = attachmentRows.map((row) => row.storageKey);
  const summary = { environment, mediaRoot, entries, attachments, revisions, templates, tags, storageKeys, confirmed };
  if (!confirmed) {
    process.stdout.write(`${JSON.stringify(summary)}\nDry run only. Re-run with --confirm-journal-reset to delete development Journal data and media.\n`);
  } else {
    // Validate and remove only Journal attachment files. Never remove the media root:
    // it also contains cards, profile images, and focus audio.
    for (const storageKey of storageKeys) {
      if (!storageKey.startsWith('journal/')) throw new Error(`Refusing non-Journal media key: ${storageKey}`);
      const absolutePath = resolveMediaStoragePath(mediaRoot, storageKey);
      if (!absolutePath) throw new Error(`Refusing unsafe Journal media key: ${storageKey}`);
      await fs.rm(absolutePath, { force: true });
    }
    await prisma.$transaction(async (tx) => {
      await tx.journalEntryRevision.deleteMany();
      await tx.journalAttachment.deleteMany();
      await tx.journalTagAssignment.deleteMany();
      await tx.journalEntry.deleteMany();
      await tx.journalTemplate.deleteMany();
      await tx.journalTag.deleteMany();
    });
    process.stdout.write(`${JSON.stringify({ ...summary, deleted: true })}\n`);
  }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
