import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOS } from './osDetection';

describe('osDetection - getOS', () => {
  let navigatorSpy;

  beforeEach(() => {
    // Spy on window.navigator getter
    navigatorSpy = vi.spyOn(window, 'navigator', 'get');
  });

  afterEach(() => {
    // Restore original navigator
    vi.restoreAllMocks();
  });

  describe('using userAgentData (modern API)', () => {
    it('detects Windows', () => {
      navigatorSpy.mockReturnValue({
        userAgentData: { platform: 'Windows' },
        userAgent: ''
      });
      expect(getOS()).toBe('Windows');
    });

    it('detects macOS', () => {
      navigatorSpy.mockReturnValue({
        userAgentData: { platform: 'macOS' },
        userAgent: ''
      });
      expect(getOS()).toBe('macOS');
    });

    it('detects Linux', () => {
      navigatorSpy.mockReturnValue({
        userAgentData: { platform: 'Linux x86_64' },
        userAgent: ''
      });
      expect(getOS()).toBe('Linux');
    });

    it('detects Android', () => {
      navigatorSpy.mockReturnValue({
        userAgentData: { platform: 'Android' },
        userAgent: ''
      });
      expect(getOS()).toBe('Android');
    });

    it('detects iOS', () => {
      navigatorSpy.mockReturnValue({
        userAgentData: { platform: 'iOS' },
        userAgent: ''
      });
      expect(getOS()).toBe('iOS');
    });
  });

  describe('using userAgent fallback (legacy API)', () => {
    it('detects iOS (iPhone)', () => {
      navigatorSpy.mockReturnValue({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
      });
      expect(getOS()).toBe('iOS');
    });

    it('detects iOS (iPad)', () => {
      navigatorSpy.mockReturnValue({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 13_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/87.0.4280.77 Mobile/15E148 Safari/604.1'
      });
      expect(getOS()).toBe('iOS');
    });

    it('detects Android', () => {
      navigatorSpy.mockReturnValue({
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36'
      });
      expect(getOS()).toBe('Android');
    });

    it('detects Windows', () => {
      navigatorSpy.mockReturnValue({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      });
      expect(getOS()).toBe('Windows');
    });

    it('detects macOS (Macintosh)', () => {
      navigatorSpy.mockReturnValue({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      });
      expect(getOS()).toBe('macOS');
    });

    it('detects Linux', () => {
      navigatorSpy.mockReturnValue({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      });
      expect(getOS()).toBe('Linux');
    });

    it('returns Unknown for unrecognized user agent', () => {
      navigatorSpy.mockReturnValue({
        userAgent: 'Some Weird Browser/1.0'
      });
      expect(getOS()).toBe('Unknown');
    });
  });
});
