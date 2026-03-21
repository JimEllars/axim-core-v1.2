
/**
 * Utility for robust operating system detection using navigator.userAgent and navigator.userAgentData.
 */
export const getOS = () => {
  const { userAgent, userAgentData } = window.navigator;

  // 1. Try modern userAgentData API if available (Chromium-based)
  if (userAgentData && userAgentData.platform) {
    const platform = userAgentData.platform.toLowerCase();
    if (platform.includes('win')) return 'Windows';
    if (platform.includes('mac')) return 'macOS';
    if (platform.includes('linux')) return 'Linux';
    if (platform.includes('android')) return 'Android';
    if (platform.includes('ios')) return 'iOS';
  }

  // 2. Fallback to userAgent string parsing
  const ua = userAgent.toLowerCase();

  // Order matters: check mobile first to avoid false positives (e.g., iOS containing "Mac OS X")
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'iOS';
  if (ua.includes('android')) return 'Android';

  if (ua.includes('win')) return 'Windows';
  if (ua.includes('macintosh') || ua.includes('mac os x')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';

  return 'Unknown';
};
