import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ datasources: { db: { url: databaseUrl() } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function databaseUrl(): string | undefined {
  const value = process.env.DATABASE_URL;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    setMissing(url, 'connection_limit', '10');
    setMissing(url, 'pool_timeout', '10');
    setMissing(url, 'connect_timeout', '10');
    return url.toString();
  } catch {
    return value;
  }
}

function setMissing(url: URL, key: string, value: string) {
  if (!url.searchParams.has(key)) url.searchParams.set(key, value);
}
