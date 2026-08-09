import type { FastifyRequest } from 'fastify';

export type BrowserExtensionRequest = FastifyRequest & {
  browserExtension: { userId: string };
};
