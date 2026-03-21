import { describe, it, expect, vi } from 'vitest';
import generalCommands from '../generalCommands';

const getInstallCommand = generalCommands.find(c => c.name === 'getInstallCommand');

describe('getInstallCommand', () => {
  it('should return the correct command for Windows', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    const result = await getInstallCommand.execute();
    expect(result).toBe('Download the .exe installer from the releases page.');
  });

  it('should return the correct command for macOS', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    const result = await getInstallCommand.execute();
    expect(result).toBe('Download the .dmg installer from the releases page.');
  });

  it('should return the correct command for Linux', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    const result = await getInstallCommand.execute();
    expect(result).toBe('Download the .AppImage from the releases page and run `chmod +x AXiM-Core-X.Y.Z.AppImage`.');
  });

  it('should return a generic message for an unknown OS', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1');
    const result = await getInstallCommand.execute();
    expect(result).toBe('Could not determine your OS (Detected: iOS). Please visit the releases page to download the installer.');
  });
});
