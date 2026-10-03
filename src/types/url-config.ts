export interface UrlConfig {
  id: string;
  type?: 'url' | 'window' | 'scene'; // 旧配置默认视为网址
  memberIds?: string[]; // 场景只保存有序引用，不复制成员配置
  url: string; // 网页 URL（窗口类型时可为空字符串）
  name: string;
  hotkey: string;
  category?: string;
  settings?: WindowSettings;
  lastPosition?: { x: number; y: number };
  lastSize?: { width: number; height: number };
  isOpen?: boolean;
  createdAt: number;
  updatedAt: number;
  
  // 窗口类型专用字段
  windowInfo?: WindowInfo;
}

export interface WindowInfo {
  hwnd: number; // 窗口句柄
  title: string; // 窗口标题
  className: string; // 窗口类名
  processId: number; // 进程 ID
  exePath: string; // 可执行文件路径
  rect: WindowRect; // 窗口矩形
  isVisible: boolean;
  icon?: string; // Base64 编码的图标
}

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowSettings {
  opacity: number; // 0-100
  hideOnMouseLeave: boolean;
  mouseThrough: boolean;
  autoHideOnEdge: boolean;
  alwaysOnTop: boolean;
  defaultWidth: number;
  defaultHeight: number;
}

export interface WindowState {
  visible: boolean;
  config: UrlConfig;
}

export interface TargetState {
  id: string;
  exists: boolean;
  visible: boolean;
  minimized: boolean;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  hwnd?: number;
}
