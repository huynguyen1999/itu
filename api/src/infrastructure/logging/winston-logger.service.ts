import fs from 'node:fs';
import path from 'node:path';
import { Injectable, LoggerService } from '@nestjs/common';
import { ILogger } from '@core/application/ports/out/services.port';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { RequestContextService } from './request-context.service';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

@Injectable()
export class WinstonLoggerService implements ILogger, LoggerService {
  private readonly logger: winston.Logger;

  constructor(private readonly requestContext: RequestContextService) {
    const repositoryRoot = process.cwd();
    const logsDir = this.resolveLogsDir(repositoryRoot);
    const auditDir = path.join(logsDir, '.audit');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(auditDir, { recursive: true });

    const fileFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf((info) => {
        const { timestamp, level, message, context, stack, ...meta } = info;
        const contextText = context ? ` [${String(context)}]` : '';
        const metaText = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `${String(timestamp)} ${String(level)}${contextText}: ${String(stack ?? message)}${metaText}`;
      }),
    );

    const transports: winston.transport[] = [
      new DailyRotateFile({
        filename: path.join(logsDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        auditFile: path.join(auditDir, 'error-audit.json'),
      }),
      new DailyRotateFile({
        filename: path.join(logsDir, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        auditFile: path.join(auditDir, 'combined-audit.json'),
      }),
    ];

    if (this.shouldLogToConsole()) {
      transports.unshift(new winston.transports.Console({ format: consoleFormat }));
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL ?? 'debug',
      format: fileFormat,
      transports,
    });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  log(message: unknown, context?: string): void {
    this.write('info', this.normalizeMessage(message), context ? { context } : undefined);
  }

  warn(message: unknown, metaOrContext?: Record<string, unknown> | string): void {
    this.write('warn', this.normalizeMessage(message), this.normalizeMeta(metaOrContext));
  }

  error(message: unknown, traceOrMeta?: string | Record<string, unknown>, context?: string): void {
    const meta =
      typeof traceOrMeta === 'string' ? { trace: traceOrMeta, ...(context ? { context } : {}) } : traceOrMeta;
    this.write('error', this.normalizeMessage(message), meta);
  }

  verbose(message: unknown, context?: string): void {
    this.write('debug', this.normalizeMessage(message), context ? { context } : undefined);
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const requestId = this.requestContext.getRequestId();
    this.logger.log(level, message, {
      ...(requestId ? { requestId } : {}),
      ...meta,
    });
  }

  private normalizeMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message instanceof Error) return message.stack ?? message.message;
    return JSON.stringify(message);
  }

  private normalizeMeta(metaOrContext?: Record<string, unknown> | string): Record<string, unknown> | undefined {
    if (!metaOrContext) return undefined;
    if (typeof metaOrContext === 'string') return { context: metaOrContext };
    return metaOrContext;
  }

  private shouldLogToConsole(): boolean {
    const setting = process.env.LOG_CONSOLE?.trim().toLowerCase();
    if (setting === 'false' || setting === '0' || setting === 'off') return false;
    if (setting === 'true' || setting === '1' || setting === 'on') return true;
    return process.env.NODE_ENV !== 'production' || Boolean(process.stdout.isTTY);
  }

  private resolveLogsDir(repositoryRoot: string): string {
    const configuredPath = process.env.LOG_PATH?.trim();
    if (!configuredPath) return path.join(repositoryRoot, 'logs');
    return path.isAbsolute(configuredPath) ? configuredPath : path.join(repositoryRoot, configuredPath);
  }
}
