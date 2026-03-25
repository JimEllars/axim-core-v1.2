import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We use vi.mock outside of beforeEach so Vitest hoists it properly.
// To modify the mock behavior per-test, we mock the module to return an object
// whose properties we can re-assign.

const mockConfig = {
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon-key',
  isMockLlmEnabled: false,
};

vi.mock('../../config', () => {
  return {
    default: mockConfig
  };
});

const mockCreateClient = vi.fn().mockReturnValue({ testClient: true });

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: (...args) => mockCreateClient(...args)
  };
});

describe('Supabase Client Initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateClient.mockReset();
    mockCreateClient.mockReturnValue({ testClient: true });

    // reset config to default valid state
    mockConfig.supabaseUrl = 'https://test.supabase.co';
    mockConfig.supabaseAnonKey = 'test-anon-key';
    mockConfig.isMockLlmEnabled = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes client successfully with valid config', async () => {
    const { supabase } = await import('../supabaseClient.js');

    expect(mockCreateClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-anon-key');
    expect(supabase.testClient).toBe(true);
  });

  it('throws error if url or anon key is missing and mock mode is disabled', async () => {
    mockConfig.supabaseUrl = '';
    mockConfig.supabaseAnonKey = '';
    mockConfig.isMockLlmEnabled = false;

    await expect(import('../supabaseClient.js')).rejects.toThrow('Supabase URL or Anon Key is missing. Make sure to set them in your .env file.');
  });

  it('uses fallback url if mock mode is enabled and url is missing', async () => {
    mockConfig.supabaseUrl = '';
    mockConfig.supabaseAnonKey = 'test-anon-key';
    mockConfig.isMockLlmEnabled = true;

    const { supabase } = await import('../supabaseClient.js');

    expect(mockCreateClient).toHaveBeenCalledWith('https://example.com', 'test-anon-key');
    expect(supabase.testClient).toBe(true);
  });

  it('uses fallback url if mock mode is enabled and url is YOUR_SUPABASE_URL', async () => {
    mockConfig.supabaseUrl = 'YOUR_SUPABASE_URL';
    mockConfig.supabaseAnonKey = 'test-anon-key';
    mockConfig.isMockLlmEnabled = true;

    const { supabase } = await import('../supabaseClient.js');

    expect(mockCreateClient).toHaveBeenCalledWith('https://example.com', 'test-anon-key');
    expect(supabase.testClient).toBe(true);
  });

  it('uses dummy key if anon key is missing and mock mode is enabled', async () => {
    mockConfig.supabaseUrl = 'https://test.supabase.co';
    mockConfig.supabaseAnonKey = '';
    mockConfig.isMockLlmEnabled = true;

    const { supabase } = await import('../supabaseClient.js');

    expect(mockCreateClient).toHaveBeenCalledWith('https://test.supabase.co', 'dummy-key');
    expect(supabase.testClient).toBe(true);
  });

  it('uses mock client if createClient throws error and mock mode is enabled', async () => {
    mockConfig.supabaseUrl = 'https://test.supabase.co';
    mockConfig.supabaseAnonKey = 'test-anon-key';
    mockConfig.isMockLlmEnabled = true;

    mockCreateClient.mockImplementationOnce(() => {
      throw new Error('Test createClient error');
    });

    const consoleSpyErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleSpyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { supabase } = await import('../supabaseClient.js');

    expect(consoleSpyErr).toHaveBeenCalledWith("Supabase client creation failed:", expect.any(Error));
    expect(consoleSpyWarn).toHaveBeenCalledWith("Using fallback mock client due to initialization error in mock mode.");

    expect(supabase).toHaveProperty('from');
    expect(supabase).toHaveProperty('auth');

    const fromMock = supabase.from('test');
    expect(await fromMock.select()).toEqual({ data: [], error: null });
    expect(await fromMock.insert()).toEqual({ data: [], error: null });
    expect(await fromMock.update()).toEqual({ data: [], error: null });
    expect(await fromMock.delete()).toEqual({ data: [], error: null });
    expect(fromMock.eq('id', 1)).toBe(fromMock);
    expect(await fromMock.single()).toEqual({ data: {}, error: null });

    const authMock = supabase.auth;
    expect(await authMock.getUser()).toEqual({ data: { user: null }, error: null });
    expect(await authMock.signInWithPassword()).toEqual({ data: {}, error: null });
    expect(await authMock.signOut()).toEqual({ error: null });

    consoleSpyErr.mockRestore();
    consoleSpyWarn.mockRestore();
  });

  it('throws error if createClient throws error and mock mode is disabled', async () => {
    mockConfig.supabaseUrl = 'https://test.supabase.co';
    mockConfig.supabaseAnonKey = 'test-anon-key';
    mockConfig.isMockLlmEnabled = false;

    mockCreateClient.mockImplementationOnce(() => {
      throw new Error('Test createClient error');
    });

    const consoleSpyErr = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(import('../supabaseClient.js')).rejects.toThrow('Test createClient error');

    consoleSpyErr.mockRestore();
  });
});
