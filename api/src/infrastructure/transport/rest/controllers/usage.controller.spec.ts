import { BrowserExtensionUsageController, UsageAppController } from './usage.controller';

describe('UsageAppController', () => {
  it('lists identities for the authenticated user', async () => {
    const usage = { getAppIdentities: jest.fn().mockResolvedValue([]) } as any;
    await expect(new UsageAppController(usage).getApps({ user: { sub: 'user-1' } } as any)).resolves.toEqual([]);
    expect(usage.getAppIdentities).toHaveBeenCalledWith('user-1');
  });

  it('rejects an icon upload without a file', async () => {
    const controller = new UsageAppController({ replaceAppIcon: jest.fn() } as any);
    await expect(
      controller.replaceIcon({ file: jest.fn().mockResolvedValue(undefined) } as any, 'com.example.App'),
    ).rejects.toThrow('Image file is required');
  });

  it('passes multipart display name and image to the service', async () => {
    const usage = {
      replaceAppIcon: jest.fn().mockResolvedValue({ bundleId: 'com.example.App' }),
    } as any;
    const upload = {
      fields: { displayName: { value: 'Example' } },
      filename: 'icon.png',
      mimetype: 'image/png',
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('image')),
    };
    await expect(
      new UsageAppController(usage).replaceIcon(
        { user: { sub: 'user-1' }, file: jest.fn().mockResolvedValue(upload) } as any,
        'com.example.App',
      ),
    ).resolves.toEqual({ bundleId: 'com.example.App' });
    expect(usage.replaceAppIcon).toHaveBeenCalledWith('user-1', {
      bundleId: 'com.example.App',
      displayName: 'Example',
      originalName: 'icon.png',
      mimeType: 'image/png',
      buffer: Buffer.from('image'),
    });
  });
});

describe('BrowserExtensionUsageController', () => {
  it('requests the Safari credential kind without changing the DSN route', async () => {
    const usage = { generateBrowserExtensionDsn: jest.fn().mockResolvedValue({ dsnKey: 'safari-dsn' }) } as any;

    await expect(
      new BrowserExtensionUsageController(usage).generateDsn(
        { user: { sub: 'user-1' } } as any,
        { kind: 'SAFARI_IOS' },
      ),
    ).resolves.toEqual({ dsnKey: 'safari-dsn' });
    expect(usage.generateBrowserExtensionDsn).toHaveBeenCalledWith('user-1', 'SAFARI_IOS');
  });

  it('passes DSN-owned user identity to session ingestion', async () => {
    const usage = { ingestWebsiteActivitySessions: jest.fn().mockResolvedValue({ accepted: ['s-1'], rejected: [] }) } as any;
    const body = { installationId: 'install-1', sessions: [] } as any;
    await expect(
      new BrowserExtensionUsageController(usage).ingestSessions(
        { browserExtension: { userId: 'user-1' } } as any,
        body,
      ),
    ).resolves.toEqual({ accepted: ['s-1'], rejected: [] });
    expect(usage.ingestWebsiteActivitySessions).toHaveBeenCalledWith('user-1', body);
  });
});
