// URL 验证
export function isValidUrl(url: string): boolean {
  try {
    normalizeUrl(url);
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('请输入网址');
  const url = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP/HTTPS 网址');
  return url.href;
}

// 快捷键格式验证
export function isValidHotkey(hotkey: string): boolean {
  const validKeys = /^(Ctrl|Alt|Shift|CommandOrControl)(\+(Ctrl|Alt|Shift|CommandOrControl))*\+[A-Z0-9]$/;
  return validKeys.test(hotkey);
}

// 快捷键格式化
export function formatHotkey(keys: string[]): string {
  return keys.join('+');
}

// 透明度验证
export function isValidOpacity(opacity: number): boolean {
  return opacity >= 10 && opacity <= 100;
}

// 窗口尺寸验证
export function isValidWindowSize(width: number, height: number): boolean {
  return width >= 200 && width <= 3840 && height >= 200 && height <= 2160;
}

