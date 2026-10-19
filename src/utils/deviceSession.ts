const DEVICE_ID_KEY = 'nxt_device_id_v1';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server-device';
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `DEV-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'fallback-device-id';
  }
}

export function getDeviceName(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Thiết bị không xác định';
  }

  const ua = navigator.userAgent;
  let browser = 'Trình duyệt web';
  let os = 'Hệ điều hành';

  // Detect browser
  if (ua.includes('Edg/')) {
    browser = 'Microsoft Edge';
  } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    browser = 'Google Chrome';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    browser = 'Apple Safari';
  } else if (ua.includes('Firefox/')) {
    browser = 'Mozilla Firefox';
  } else if (ua.includes('OPR/') || ua.includes('Opera/')) {
    browser = 'Opera';
  }

  // Detect OS
  if (ua.includes('Win')) {
    os = 'Windows';
  } else if (ua.includes('Macintosh') || ua.includes('Mac OS')) {
    os = 'macOS';
  } else if (ua.includes('iPhone')) {
    os = 'iPhone (iOS)';
  } else if (ua.includes('iPad')) {
    os = 'iPad (iPadOS)';
  } else if (ua.includes('Android')) {
    os = 'Android';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }

  return `${browser} trên ${os}`;
}

export function isSessionStale(lastActiveAt?: string | null, maxInactivityHours: number = 24): boolean {
  if (!lastActiveAt) return true;
  const lastActiveTime = new Date(lastActiveAt).getTime();
  if (isNaN(lastActiveTime)) return true;
  const now = Date.now();
  const diffHours = (now - lastActiveTime) / (1000 * 60 * 60);
  return diffHours > maxInactivityHours;
}
