/**
 * Device helper to identify unique browser / device instances
 * and produce human-friendly device names for single-session tracking.
 */

export interface DeviceInfo {
  id: string;
  name: string;
  browser: string;
  os: string;
  isMobile: boolean;
}

const DEVICE_ID_KEY = 'nxt_inventory_device_id_v1';
const DEVICE_NAME_KEY = 'nxt_inventory_custom_device_name_v1';

export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'server-env';
  }
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timeHex = Date.now().toString(36).toUpperCase();
    id = `DEV-${timeHex}-${randomHex}`;
    try {
      localStorage.setItem(DEVICE_ID_KEY, id);
    } catch {
      // ignore
    }
  }
  return id;
}

export function detectDeviceDetails(): { browser: string; os: string; isMobile: boolean } {
  if (typeof window === 'undefined' || !navigator) {
    return { browser: 'Web Browser', os: 'Desktop', isMobile: false };
  }

  const ua = navigator.userAgent || '';
  let os = 'Hệ điều hành khác';
  let isMobile = false;

  // OS detection
  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone/i.test(ua)) {
    os = 'iPhone (iOS)';
    isMobile = true;
  } else if (/iPad/i.test(ua)) {
    os = 'iPad (iPadOS)';
    isMobile = true;
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    isMobile = true;
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  }

  // Browser detection
  let browser = 'Trình duyệt web';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Google Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Apple Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Opera|OPR\//i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';

  return { browser, os, isMobile };
}

export function getDeviceName(): string {
  if (typeof window === 'undefined') {
    return 'Thiết bị máy chủ';
  }

  // Allow custom override if saved
  const customName = localStorage.getItem(DEVICE_NAME_KEY);
  if (customName && customName.trim()) {
    return customName.trim();
  }

  const { browser, os } = detectDeviceDetails();
  return `${browser} trên ${os}`;
}

export function getDeviceInfo(): DeviceInfo {
  const id = getDeviceId();
  const name = getDeviceName();
  const { browser, os, isMobile } = detectDeviceDetails();
  return { id, name, browser, os, isMobile };
}
