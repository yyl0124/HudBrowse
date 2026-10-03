export const APP_NAME = 'HudBrowse';
export const APP_VERSION = 'v1.0.18';

// 默认窗口尺寸
export const DEFAULT_WINDOW_WIDTH = 800;
export const DEFAULT_WINDOW_HEIGHT = 600;

// 贴边隐藏阈值（像素）
export const EDGE_THRESHOLD = 10;

// 移出隐藏延迟（毫秒）
export const HIDE_ON_MOUSE_LEAVE_DELAY = 500;

// 最小/最大透明度
export const MIN_OPACITY = 10;
export const MAX_OPACITY = 100;

// 预设快捷键（避免冲突）
export const RESERVED_HOTKEYS = [
  'Ctrl+C',
  'Ctrl+V',
  'Ctrl+X',
  'Ctrl+Z',
  'Ctrl+A',
  'Alt+Tab',
  'Alt+F4',
];

// 分类选项
export const DEFAULT_CATEGORIES = [
  { value: 'social', label: '社交', color: 'blue' },
  { value: 'work', label: '办公', color: 'purple' },
  { value: 'dev', label: '开发', color: 'green' },
  { value: 'entertainment', label: '娱乐', color: 'pink' },
  { value: 'shopping', label: '购物', color: 'orange' },
  { value: 'news', label: '资讯', color: 'red' },
  { value: 'tool', label: '工具', color: 'gray' },
  { value: 'education', label: '学习', color: 'indigo' },
  { value: 'finance', label: '财务', color: 'yellow' },
  { value: 'other', label: '其他', color: 'slate' },
];

/** @deprecated Use categories from the app store for reactive, user-managed labels. */
export const CATEGORY_OPTIONS = DEFAULT_CATEGORIES;

// 获取分类的颜色样式
export const getCategoryColor = (color: string) => {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    blue: { 
      bg: 'bg-blue-100 dark:bg-blue-900/30', 
      text: 'text-blue-700 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800'
    },
    purple: { 
      bg: 'bg-purple-100 dark:bg-purple-900/30', 
      text: 'text-purple-700 dark:text-purple-400',
      border: 'border-purple-200 dark:border-purple-800'
    },
    green: { 
      bg: 'bg-green-100 dark:bg-green-900/30', 
      text: 'text-green-700 dark:text-green-400',
      border: 'border-green-200 dark:border-green-800'
    },
    pink: { 
      bg: 'bg-pink-100 dark:bg-pink-900/30', 
      text: 'text-pink-700 dark:text-pink-400',
      border: 'border-pink-200 dark:border-pink-800'
    },
    orange: { 
      bg: 'bg-orange-100 dark:bg-orange-900/30', 
      text: 'text-orange-700 dark:text-orange-400',
      border: 'border-orange-200 dark:border-orange-800'
    },
    red: { 
      bg: 'bg-red-100 dark:bg-red-900/30', 
      text: 'text-red-700 dark:text-red-400',
      border: 'border-red-200 dark:border-red-800'
    },
    gray: { 
      bg: 'bg-gray-100 dark:bg-gray-900/30', 
      text: 'text-gray-700 dark:text-gray-400',
      border: 'border-gray-200 dark:border-gray-800'
    },
    indigo: { 
      bg: 'bg-indigo-100 dark:bg-indigo-900/30', 
      text: 'text-indigo-700 dark:text-indigo-400',
      border: 'border-indigo-200 dark:border-indigo-800'
    },
    yellow: { 
      bg: 'bg-yellow-100 dark:bg-yellow-900/30', 
      text: 'text-yellow-700 dark:text-yellow-400',
      border: 'border-yellow-200 dark:border-yellow-800'
    },
    slate: { 
      bg: 'bg-slate-100 dark:bg-slate-900/30', 
      text: 'text-slate-700 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-800'
    },
  };
  return colors[color] || colors.gray;
};
