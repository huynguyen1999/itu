import type { FastifyRequest } from 'fastify';

export interface AuthenticatedUserPayload {
  sub: string;
  email?: string;
}

export type AuthenticatedRequest = FastifyRequest & {
  user: AuthenticatedUserPayload;
};

export type AuthenticatedMultipartRequest = AuthenticatedRequest;
