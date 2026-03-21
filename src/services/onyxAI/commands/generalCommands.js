import { createCommand } from './commandFactory';
import { getOS } from '@/utils/osDetection';

const getInstallCommand = createCommand({
  name: 'getInstallCommand',
  description: 'Provides installation instructions for the AXiM Core application.',
  keywords: ['install', 'get', 'command', 'setup'],
  aliases: ['install-instructions'],
  usage: 'get install command',
  category: 'System',
  execute: async () => {
    const os = getOS();

    if (os === 'Windows') {
      return 'Download the .exe installer from the releases page.';
    } else if (os === 'macOS') {
      return 'Download the .dmg installer from the releases page.';
    } else if (os === 'Linux') {
      return 'Download the .AppImage from the releases page and run `chmod +x AXiM-Core-X.Y.Z.AppImage`.';
    } else {
      return `Could not determine your OS (Detected: ${os}). Please visit the releases page to download the installer.`;
    }
  },
});

export default [getInstallCommand];
