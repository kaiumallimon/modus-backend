import configuration from './configuration';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load default configuration values when env vars are not set', () => {
    delete process.env.APP_NAME;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.MONGODB_DATABASE;
    delete process.env.DB_NAME;

    const config = configuration();

    expect(config.app.name).toBe('Modus');
    expect(config.app.environment).toBe('development');
    expect(config.app.port).toBe(3000);
    expect(config.database.name).toBe('modus');
    expect(config.cors.origin).toEqual(['http://localhost:3001']);
  });

  it('should prioritize MONGODB_DATABASE over DB_NAME', () => {
    process.env.MONGODB_DATABASE = 'custom_modus_db';
    process.env.DB_NAME = 'fallback_db';

    const config = configuration();

    expect(config.database.name).toBe('custom_modus_db');
  });

  it('should use DB_NAME if MONGODB_DATABASE is not set', () => {
    delete process.env.MONGODB_DATABASE;
    process.env.DB_NAME = 'legacy_db';

    const config = configuration();

    expect(config.database.name).toBe('legacy_db');
  });
});
