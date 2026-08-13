import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { JournalController } from './journal.controller';
import { JournalService } from '@core/application/use-cases/journal/journal.service';
import { ReviewInsightsService } from '@core/application/use-cases/review-insights.service';
import { TOKENS } from '@core/application/constants/tokens';
import { AuthGuard } from '../guards/auth.guard';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('JournalController Routes', () => {
  let app: NestFastifyApplication;
  let mockJournalService: Partial<JournalService>;
  let mockMediaStorage: any;
  let mockReviewInsights: Partial<ReviewInsightsService>;

  beforeAll(async () => {
    mockJournalService = {
      listEntries: jest.fn().mockResolvedValue([]),
      listTemplates: jest.fn().mockResolvedValue([]),
      listTags: jest.fn().mockResolvedValue([]),
      getEntry: jest.fn(),
      restoreRevision: jest.fn(),
    };

    mockMediaStorage = {
      storeRawBuffer: jest.fn(),
      read: jest.fn(),
      delete: jest.fn(),
    };
    mockReviewInsights = { generate: jest.fn().mockResolvedValue({ id: 'review-1' }) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [JournalController],
      providers: [
        { provide: JournalService, useValue: mockJournalService },
        { provide: TOKENS.MEDIA_STORAGE, useValue: mockMediaStorage },
        { provide: ReviewInsightsService, useValue: mockReviewInsights },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) {
            throw new UnauthorizedException();
          }
          req.user = { sub: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /journal/entries returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/journal/entries' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /journal/templates returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/journal/templates' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /journal/tags returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/journal/tags' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /journal/entries returns 200 when authenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/journal/entries',
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('POST /journal/entries/:id/ai-insights uses the direct generator when authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/journal/entries/review-1/ai-insights',
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockReviewInsights.generate).toHaveBeenCalledWith('user-1', 'review-1');
  });
});
