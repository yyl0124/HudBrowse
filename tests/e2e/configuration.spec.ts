import { test, expect, Page } from '@playwright/test';
import { UrlConfig } from '../../src/types/url-config';

async function screenshot(page: Page, path: string, fullPage = true) {
  // Capture the settled appearance rather than an intermediate entrance/hover frame.
  await page.waitForTimeout(450);
  if (path.includes('workbench')) await page.locator('.target-list').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path, fullPage });
}

async function desktopFixture(page: Page, seed: UrlConfig[] = []) {
  await page.route('**/favicon.ico', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#127d59"/></svg>' }));
  await page.addInitScript((seed) => {
    if (seed.length && !localStorage.getItem('hudbrowse_url_configs')) localStorage.setItem('hudbrowse_url_configs', JSON.stringify(seed));
    const windowInfo = { hwnd: 42, processId: 7, title: 'Desktop fixture', exePath: 'C:\\fixture.exe', className: 'Fixture', isVisible: true, rect: { x: -900, y: 100, width: 800, height: 600 } };
    let configs: Record<string, unknown>[] = [];
    const states: Record<string, Record<string, unknown>> = {};
    const registered = new Set<string>();
    const handlers = new Map<string, number>();
    const calls: Record<string, unknown>[] = [];
    Object.assign(window, { __triggerShortcut: (key: string) => (window as any)[`_${handlers.get(key)}`]?.(key), __nativeCalls: calls, __TAURI_IPC__: (request: Record<string, any>) => {
      calls.push(request);
      let result: unknown;
      let error: unknown;
      switch (request.cmd) {
        case 'sync_targets': configs = request.configs; break;
        case 'load_session': result = ((window as any).__restoreSession ?? []).map((id: string) => ({ id, exists: true, visible: true, minimized: false })); break;
        case 'get_auto_start': result = false; break;
        case 'set_main_compact':
          if ((window as any).__failCompactOnce) {
            (window as any).__failCompactOnce = false;
            error = 'Compact transition fixture failure';
          }
          break;
        case 'get_target_states': result = configs.map(config => states[config.id as string] ?? { id: config.id, exists: false, visible: false, minimized: false }); break;
        case 'toggle_target':
        case 'show_target': {
          const id = request.config.id;
          states[id] = { id, exists: true, visible: request.cmd === 'show_target' || !states[id]?.visible, minimized: false, position: { x: -900, y: 100 }, size: { width: 800, height: 600 } };
          result = states[id]; break;
        }
        case 'hide_target': {
          const id = request.id;
          states[id] = { ...(states[id] ?? { id, exists: false, minimized: false }), visible: false };
          result = states[id]; break;
        }
        case 'apply_target_settings': result = states[request.config.id] ?? { id: request.config.id, exists: false, visible: false, minimized: false }; break;
        case 'remove_target': delete states[request.id]; break;
        case 'enumerate_windows': result = [windowInfo]; break;
        case 'get_window_icon':
        case 'get_site_icon': result = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#127d59"/></svg>'); break;
        case 'tauri': {
          const message = request.message;
          if (request.__tauriModule === 'GlobalShortcut') {
            if (message.cmd === 'register') {
              if (registered.has(message.shortcut) || message.shortcut === 'Alt+F9') error = 'Shortcut occupied';
              else { registered.add(message.shortcut); handlers.set(message.shortcut, message.handler); }
            }
            if (message.cmd === 'unregister') registered.delete(message.shortcut);
          }
          if (request.__tauriModule === 'Event') result = 1;
          break;
        }
      }
      const callback = (window as unknown as Record<string, (value: unknown) => void>)[`_${error ? request.error : request.callback}`];
      callback(error ?? result);
    } });
  }, seed);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: '添加网址', exact: true })).toBeEnabled();
}

test('independent settings, inheritance, repeated toggles and editing', async ({ page }) => {
  await desktopFixture(page);
  await page.getByRole('button', { name: '添加网址', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称', { exact: true }).fill('Example');
  await dialog.getByLabel('网址', { exact: true }).fill('example.com');
  await dialog.getByRole('switch', { name: '使用独立设置' }).click();
  await dialog.getByRole('switch', { name: '贴边隐藏' }).click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('独立配置', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '显示窗口', exact: true }).click();
  await expect(page.getByRole('article').getByText('显示中', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '隐藏窗口', exact: true }).click();
  await expect(page.getByText('已隐藏', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('switch', { name: '贴边隐藏' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByLabel('名称', { exact: true }).fill('Renamed');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Renamed' })).toBeVisible();
  await page.getByRole('button', { name: '窗口设置', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '继承全局默认' }).click();
  await dialog.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.getByRole('article').getByText('全局默认', { exact: true })).toBeVisible();
  await screenshot(page, 'test-results/configuration-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Renamed' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '窗口设置', exact: true }).click();
  await page.getByRole('switch', { name: '使用独立设置' }).click();
  await screenshot(page, 'test-results/configuration-mobile.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('failed shortcut registration leaves the dialog open and configuration unchanged', async ({ page }) => {
  await desktopFixture(page);
  await page.getByRole('button', { name: '添加网址', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称', { exact: true }).fill('Invalid shortcut');
  await dialog.getByLabel('网址', { exact: true }).fill('example.com');
  await dialog.getByLabel('快捷键', { exact: true }).fill('Alt+F9');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Shortcut occupied');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invalid shortcut' })).toHaveCount(0);
});

test('captured targets use native dispatch and expose per-window settings', async ({ page }) => {
  await desktopFixture(page);
  await page.getByRole('button', { name: '捕获窗口', exact: true }).click();
  await page.getByRole('button', { name: /Desktop fixture/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '显示窗口', exact: true }).click();
  const calls = await page.evaluate(() => (window as any).__nativeCalls);
  const toggle = calls.find((call: any) => call.cmd === 'toggle_target');
  expect(toggle.config.type).toBe('window');
  expect(calls.some((call: any) => call.cmd === 'create_browser_window')).toBe(false);
  await page.getByRole('button', { name: '窗口设置', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

const showcase: UrlConfig[] = [
  { id: 'github', type: 'url', name: 'GitHub', url: 'https://github.com/', hotkey: 'Alt+G', category: 'dev', createdAt: 600, updatedAt: 600 },
  { id: 'linear', type: 'url', name: 'Linear', url: 'https://linear.app/', hotkey: 'Alt+L', category: 'work', createdAt: 500, updatedAt: 500, settings: { opacity: 90, autoHideOnEdge: true, hideOnMouseLeave: false, alwaysOnTop: true, mouseThrough: false, defaultWidth: 960, defaultHeight: 640 } },
  { id: 'notion', type: 'url', name: 'Notion', url: 'https://www.notion.so/', hotkey: 'Alt+N', category: 'work', createdAt: 400, updatedAt: 400 },
  { id: 'figma', type: 'url', name: 'Figma', url: 'https://www.figma.com/', hotkey: 'Alt+F', category: 'tool', createdAt: 300, updatedAt: 300 },
  { id: 'terminal', type: 'window', name: 'Windows Terminal', url: '', hotkey: 'Alt+T', category: 'dev', createdAt: 200, updatedAt: 200, windowInfo: { hwnd: 77, processId: 11, title: 'Windows Terminal', exePath: 'C:\\Program Files\\WindowsApps\\WindowsTerminal.exe', className: 'CASCADIA_HOSTING_WINDOW_CLASS', isVisible: true, rect: { x: 80, y: 100, width: 900, height: 600 } } },
  { id: 'read', type: 'url', name: '少数派 · 数字生活', url: 'https://sspai.com/', hotkey: '', category: 'news', createdAt: 100, updatedAt: 100 },
];

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`brand, plain Chinese copy and interruptible motion (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1120, height: 760 });
    await desktopFixture(page, showcase);
    await expect(page.getByText('常用窗口，随手即达', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '悬浮空间', exact: true })).toBeVisible();
    await expect(page.locator('.library-count, .heading-marker')).toHaveCount(0);
    await expect(page.getByText(/TARGET DETAILS|HUDBROWSE \/ CONFIGURE|DESKTOP CAPTURE|YOUR DESKTOP|\/ TARGET/)).toHaveCount(0);
    await expect(page.locator('.brand-icon')).toHaveAttribute('src', '/hudbrowse-small.png');
    const group = page.getByRole('group', { name: '目标类型' });
    // Dispatch rapid input without waiting for Playwright's element stability checks.
    await group.evaluate(async element => {
      const buttons = element.querySelectorAll<HTMLButtonElement>('button');
      for (const index of [2, 0, 1]) {
        buttons[index].click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
    });
    await expect(page.getByRole('article')).toHaveCount(5);
    await expect(group.getByRole('button', { name: /网址/ })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.getByRole('article').first().evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    await expect.poll(() => group.evaluate(element => {
      const selected = element.querySelector('.is-selected')!.getBoundingClientRect();
      const highlight = element.querySelector('.selection-indicator')!.getBoundingClientRect();
      return Math.abs(selected.x - highlight.x) < 1 && Math.abs(selected.width - highlight.width) < 1;
    })).toBe(true);
    if (reducedMotion === 'reduce') {
      expect(await group.locator('.selection-indicator').evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(.001);
    }
    await page.getByRole('button', { name: '捕获窗口', exact: true }).click();
    await page.getByRole('button', { name: /Desktop fixture/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox', { name: '名称', exact: true })).toBeFocused();
    await page.waitForTimeout(350);
    await expect(dialog.getByRole('textbox', { name: '名称', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await page.getByRole('button', { name: '全局设置', exact: true }).click();
    await page.getByRole('tab', { name: '外观', exact: true }).click();
    await page.getByRole('tab', { name: '外观', exact: true }).press('ArrowLeft');
    await expect(page.getByRole('tab', { name: '应用', exact: true })).toBeFocused();
    await expect(page.getByRole('tabpanel')).toContainText('启动与常驻');
    await expect(page.getByText(/MAKE IT YOURS|GLOBAL DEFAULTS|PREFERENCES/)).toHaveCount(0);
  });
}

test('reported shell and controls regressions', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 760 });
  await desktopFixture(page, showcase);
  await expect.soft(page.locator('select')).toHaveCount(0);
  await expect.soft(page.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(0);
  await expect.soft(page.locator('.shell-outline')).toBeVisible();
  const header = page.getByRole('banner', { name: '标题栏' });
  await header.dispatchEvent('mousedown', { button: 0 });
  await expect.soft.poll(async () => page.evaluate(() => (window as any).__nativeCalls.some((call: any) => call.__tauriModule === 'Window' && call.message?.cmd === 'manage' && call.message?.data?.cmd?.type === 'startDragging'))).toBe(true);
  expect.soft(await page.locator('.inspector-scroll').evaluate(element => getComputedStyle(element).scrollbarWidth)).toBe('none');
  for (const width of [320, 760, 1120]) {
    await page.setViewportSize({ width, height: 760 });
    const bounds = await header.boundingBox();
    for (const control of [page.locator('.brand-icon'), header.getByRole('button', { name: '关闭窗口', exact: true })]) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThan(bounds!.x + 8);
      expect(box!.x + box!.width).toBeLessThan(bounds!.x + bounds!.width - 8);
    }
  }
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.getByRole('button', { name: '选择 Windows Terminal', exact: true }).click();
  await expect(page.getByRole('complementary').locator('.target-icon img')).toBeVisible();
  await page.getByRole('button', { name: '添加网址', exact: true }).click();
  const category = page.getByRole('combobox', { name: '分类', exact: true });
  await category.focus();
  await category.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await category.press('Home');
  await category.press('ArrowDown');
  await category.press('Enter');
  await expect(category).toHaveText('办公');
  await category.click();
  await category.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('new workbench filters, inspector, sculpted shell and compact mode preserve selection', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 760 });
  await desktopFixture(page, showcase);
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'GitHub', exact: true }) }).getByRole('button', { name: '显示窗口', exact: true }).click();
  await page.getByRole('button', { name: '选择 Linear', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '选中目标详情' })).toContainText('90');
  await screenshot(page, 'test-results/island-workbench-desktop.png');
  await expect(page.locator('img.brand-icon')).toBeVisible();
  expect(await page.locator('img.brand-icon').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByLabel('搜索目标').fill('terminal');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: '清空搜索' }).click();
  await page.getByRole('group', { name: '目标类型' }).getByRole('button', { name: /桌面/ }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('group', { name: '目标类型' }).getByRole('button', { name: /全部/ }).click();
  await page.getByRole('combobox', { name: '筛选分类' }).click();
  await page.getByRole('option', { name: '办公', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('combobox', { name: '筛选分类' }).click();
  await page.getByRole('option', { name: '全部分类', exact: true }).click();
  await page.getByRole('button', { name: '选择 Linear', exact: true }).click();
  await page.getByRole('button', { name: '收起为灵动岛' }).click();
  await page.setViewportSize({ width: 440, height: 100 });
  await expect(page.getByRole('button', { name: '展开工作台' })).toBeVisible();
  const compactIcon = page.locator('.compact-title .target-icon').first();
  await expect(page.locator('.desktop-shell')).not.toHaveAttribute('aria-busy');
  await expect(compactIcon.locator('img')).toBeVisible();
  // The image has its own entrance animation after the shell transition settles.
  await expect.poll(() => compactIcon.locator('img').evaluate(image => image.getBoundingClientRect().width)).toBe(30);
  const iconStyle = await compactIcon.evaluate(element => {
    const image = element.querySelector('img')!;
    return { border: getComputedStyle(element).borderWidth,
      ring: getComputedStyle(element, '::after').content,
      imageWidth: image.getBoundingClientRect().width,
      slotWidth: element.getBoundingClientRect().width,
      padding: getComputedStyle(image).padding };
  });
  expect(iconStyle).toEqual({ border: '1px', ring: 'none', imageWidth: 30, slotWidth: 36, padding: '0px' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, 'test-results/island-compact.png', false);
  await expect(page.locator('.compact-title .brand-icon')).toHaveCSS('width', '36px');
  await expect(compactIcon).toHaveCSS('border-top-style', 'solid');
  await page.locator('.compact-target').first().click();
  await expect(compactIcon).toHaveCSS('border-top-style', 'dashed');
  await page.locator('.compact-target').first().click();
  await expect(compactIcon).toHaveCSS('border-top-style', 'solid');
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.getByRole('button', { name: '展开工作台' }).click();
  await expect(page.getByRole('button', { name: '选择 Linear', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const calls = await page.evaluate(() => (window as any).__nativeCalls);
  expect(calls.filter((call: any) => call.cmd === 'set_main_compact').map((call: any) => call.compact)).toEqual([true, false]);
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, 'test-results/island-workbench-mobile.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Linear', exact: true }) }).getByRole('button', { name: '窗口设置', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('switch', { name: '贴边隐藏' })).toHaveAttribute('aria-checked', 'true');
  await screenshot(page, 'test-results/island-options-mobile.png');
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: '应用', exact: true }).click();
  await page.setViewportSize({ width: 760, height: 560 });
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Linear', exact: true }) }).getByRole('button', { name: '窗口设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '应用', exact: true }).scrollIntoViewIfNeeded();
  await screenshot(page, 'test-results/island-options-minimum.png');
  await expect(page.getByRole('dialog').getByRole('button', { name: '应用', exact: true })).toBeVisible();
});

test('global defaults, appearance, application settings and deletion stay functional', async ({ page }) => {
  await desktopFixture(page, showcase);
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await page.getByRole('switch', { name: '贴边隐藏' }).click();
  await page.getByRole('switch', { name: '移出隐藏' }).click();
  await expect(page.getByRole('switch', { name: '贴边隐藏' })).toHaveAttribute('aria-checked', 'false');
  await page.getByLabel('默认宽度', { exact: true }).fill('1024');
  await expect.poll(async () => {
    const calls = await page.evaluate(() => (window as any).__nativeCalls);
    return calls.filter((call: any) => call.cmd === 'apply_target_settings' && call.config.id === 'github').at(-1)?.config.settings.defaultWidth;
  }).toBe(1024);
  await screenshot(page, 'test-results/island-settings-dark.png');
  await page.getByRole('tab', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: '银白', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('tab', { name: '应用', exact: true }).click();
  await page.getByRole('switch', { name: '显示托盘图标' }).click();
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await screenshot(page, 'test-results/island-workbench-light.png');
  const row = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Figma', exact: true }) });
  await row.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认移除' }).click();
  await expect(page.getByRole('heading', { name: 'Figma', exact: true })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hudbrowse_url_configs')!).data);
  expect(saved).toHaveLength(5);
  expect(saved.find((config: UrlConfig) => config.id === 'linear').settings.defaultWidth).toBe(960);
});

test('category management creates, renames and migrates targets when deleting a category', async ({ page }) => {
  await desktopFixture(page, showcase);
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await expect(page.getByRole('tab', { name: '窗口', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '默认窗口设置', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '分类', exact: true }).click();
  const categories = page.locator('.category-list');
  const social = categories.locator('.category-row').filter({ hasText: '社交' });
  await social.getByRole('button', { name: '编辑 社交' }).click();
  const editor = categories.locator('.category-editor');
  await editor.locator('input').fill('社区');
  await editor.getByRole('button', { name: '保存分类' }).click();
  await page.getByLabel('新分类').fill('研究');
  await page.getByRole('button', { name: '添加分类' }).click();
  await expect(categories.getByText('研究', { exact: true })).toBeVisible();

  const work = categories.locator('.category-row').filter({ hasText: '办公' });
  await work.getByRole('button', { name: '删除 办公' }).click();
  await expect(work.getByText('删除后将移至「社区」')).toBeVisible();
  await work.locator('.category-delete-confirm').getByRole('button', { name: '删除', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hudbrowse_url_configs')!).data);
  expect(saved.filter((config: UrlConfig) => config.category === 'work')).toHaveLength(0);
  expect(saved.find((config: UrlConfig) => config.id === 'linear').category).toBe('social');

  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await page.getByRole('button', { name: '添加网址', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: '分类', exact: true }).click();
  await expect(page.getByRole('option', { name: '研究', exact: true })).toBeVisible();
});

test('visibility state, empty transitions, details hint and application grid', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 560 });
  await desktopFixture(page, showcase.filter(item => item.type === 'url'));
  const visibility = page.locator('.visibility-button').first();
  await expect(visibility.locator('.lucide-eye-off')).toBeVisible();
  await visibility.click();
  await expect(visibility.locator('.lucide-eye')).toBeVisible();
  await visibility.click();
  await expect(visibility.locator('.lucide-eye-off')).toBeVisible();
  await page.waitForTimeout(400);
  const overflowFrames = await page.getByRole('group', { name: '目标类型' }).evaluate(async group => {
    const buttons = group.querySelectorAll<HTMLButtonElement>('button');
    const page = document.querySelector<HTMLElement>('.page-content:not(.settings-page)')!;
    let overflow = 0;
    for (const index of [2, 0, 2, 1]) {
      buttons[index].click();
      for (let frame = 0; frame < 22; frame++) {
        await new Promise(requestAnimationFrame);
        if (page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1) overflow++;
      }
    }
    return overflow;
  });
  expect(overflowFrames).toBe(0);
  expect(await page.locator('.target-list').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  const hint = page.getByRole('button', { name: '向下查看更多详情' });
  await expect(hint).toBeVisible();
  await hint.click();
  await expect.poll(() => page.locator('.inspector-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.locator('.inspector-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(hint).toBeHidden();
  await page.locator('.inspector-scroll').evaluate(el => { el.scrollTop = 0; });
  await expect(hint).toBeVisible();
  await page.setViewportSize({ width: 1120, height: 1000 });
  await expect(hint).toBeHidden();
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await page.getByRole('tab', { name: '应用', exact: true }).click();
  const boxes = await page.locator('.application-options .toggle-row').evaluateAll(elements => elements.map(el => {
    const { x, y, width } = el.getBoundingClientRect(); return { x, y, width };
  }));
  expect(boxes).toHaveLength(4);
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  expect(Math.abs(boxes[0].width - boxes[2].width)).toBeLessThan(1);
  await screenshot(page, 'test-results/island-application.png');
});

test('close behavior persists, synchronizes on startup and resets to tray', async ({ page }) => {
  await desktopFixture(page);
  const openApplication = async () => {
    await page.getByRole('button', { name: '全局设置', exact: true }).click();
    await page.getByRole('tab', { name: '应用', exact: true }).click();
  };
  const lastCloseSetting = () => page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.cmd === 'set_close_to_tray').at(-1)?.enabled);
  await openApplication();
  const toggle = page.getByRole('switch', { name: '关闭时最小化到托盘', exact: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect.poll(lastCloseSetting).toBe(false);
  await expect(page.getByText('点击关闭按钮后，退出 HudBrowse。', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '添加网址', exact: true })).toBeEnabled();
  await expect.poll(lastCloseSetting).toBe(false);
  await openApplication();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: '恢复默认设置', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect.poll(lastCloseSetting).toBe(true);
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__nativeCalls.some((call: any) => call.cmd === 'request_main_close'))).toBe(true);
  await page.getByRole('switch', { name: '显示托盘图标', exact: true }).click();
  await expect(page.getByText('托盘图标已关闭，点击关闭按钮后将最小化到任务栏。', { exact: true })).toBeVisible();
});

test('island keeps order, supports drag sorting and scrolls to additional targets', async ({ page }) => {
  await desktopFixture(page, showcase);
  await page.getByRole('button', { name: '收起为灵动岛' }).click();
  await page.setViewportSize({ width: 440, height: 100 });
  await expect(page.locator('.desktop-shell')).not.toHaveAttribute('aria-busy');
  const buttons = page.locator('.compact-target');
  await expect(buttons).toHaveCount(6);
  const order = () => buttons.evaluateAll(elements => elements.map(el => el.getAttribute('data-target-id')));
  const before = await order();
  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true');
  expect(await order()).toEqual(before);
  await buttons.nth(0).dragTo(buttons.nth(2));
  await expect.poll(order).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
  const rail = page.locator('.compact-target-scroll');
  await rail.hover();
  await page.mouse.wheel(0, 160);
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(70);
  await buttons.nth(4).click();
  await expect(buttons.nth(4)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.getByRole('button', { name: '收起为灵动岛' }).click();
  await page.setViewportSize({ width: 440, height: 100 });
  await expect.poll(order).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
});

test('island accepts fine wheel deltas and mouse browsing', async ({ page }) => {
  await desktopFixture(page, showcase);
  await page.getByRole('button', { name: '收起为灵动岛' }).click();
  await page.setViewportSize({ width: 440, height: 100 });
  await expect(page.locator('.desktop-shell')).not.toHaveAttribute('aria-busy');
  const rail = page.locator('.compact-target-scroll');
  await rail.hover();
  await page.mouse.wheel(0, 8);
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(2);
  await page.getByRole('button', { name: '向右浏览目标' }).click();
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(70);
  await page.getByRole('button', { name: '向左浏览目标' }).click();
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeLessThan(10);
});

test('island pointer drag can cancel and scroll across pages without opening a target', async ({ page }) => {
  await desktopFixture(page, showcase);
  await page.getByRole('button', { name: '收起为灵动岛' }).click();
  await page.setViewportSize({ width: 440, height: 100 });
  await expect(page.locator('.desktop-shell')).not.toHaveAttribute('aria-busy');
  const rail = page.locator('.compact-target-scroll');
  const buttons = page.locator('.compact-target');
  const order = () => buttons.evaluateAll(elements => elements.map(el => el.getAttribute('data-target-id')));
  const before = await order();
  const first = (await buttons.first().boundingBox())!;
  const bounds = (await rail.boundingBox())!;
  const y = first.y + first.height / 2;
  await page.mouse.move(first.x + first.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(first.x + 70, y, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await order()).toEqual(before);
  await page.mouse.move(first.x + first.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 2, y, { steps: 5 });
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(75);
  await page.mouse.move(bounds.x + bounds.width - 18, y);
  await page.mouse.up();
  await expect.poll(order).toEqual([...before.slice(1), before[0]]);
  expect(await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.cmd === 'toggle_target').length)).toBe(0);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`compact transition settles and recovers from native failure (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1120, height: 760 });
    await desktopFixture(page, showcase);
    const root = page.locator('.desktop-shell');
    await page.evaluate(() => { (window as any).__failCompactOnce = true; });
    await page.getByRole('button', { name: '收起为灵动岛' }).click();
    await expect(page.getByRole('alert')).toContainText('Compact transition fixture failure');
    await expect(root).not.toHaveAttribute('aria-busy');
    expect(await root.evaluate(el => (el as HTMLElement).inert)).toBe(false);
    expect(await root.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    await page.getByRole('button', { name: '关闭错误提示' }).click();
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.getByRole('button', { name: '收起为灵动岛' }).click();
      if (reducedMotion === 'no-preference') {
        await expect(root).toHaveAttribute('aria-busy', 'true');
        expect(await root.evaluate(el => getComputedStyle(el).transform)).not.toBe('none');
      }
      await expect(page.getByRole('button', { name: '展开工作台' })).toBeEnabled();
      await expect(root).not.toHaveAttribute('aria-busy');
      await expect(page.locator('.workspace-surface')).toBeHidden();
      await page.getByRole('button', { name: '展开工作台' }).click();
      await expect(page.getByRole('button', { name: '收起为灵动岛' })).toBeEnabled();
      await expect(root).not.toHaveAttribute('aria-busy');
      expect(await root.evaluate(el => (el as HTMLElement).inert)).toBe(false);
      expect(await root.evaluate(el => getComputedStyle(el).transform)).toBe('none');
      await expect(page.getByRole('heading', { name: '悬浮空间', exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.cmd === 'set_main_compact').map((call: any) => call.compact))).toEqual([true, true, false, true, false, true, false]);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}


test('scene membership order, shortcut majority, editing and deletion stay linked to original targets', async ({ page }) => {
  test.setTimeout(120000); // Includes a cold browser load, reload and both shell modes.
  await desktopFixture(page, showcase);
  await page.getByRole('button', { name: '添加场景', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称', { exact: true }).fill('专注办公');
  await dialog.getByLabel('快捷键', { exact: true }).fill('Alt+J');
  const names = [showcase[4].name, showcase[0].name, showcase[1].name];
  for (const name of names) await dialog.getByRole('checkbox', { name, exact: true }).check();
  await expect(dialog.getByLabel('启动顺序').locator('li')).toHaveText(names.map((name, i) => `${i + 1}${name}`));
  await page.setViewportSize({ width: 1120, height: 1000 });
  await dialog.locator('.modal-content').evaluate(el => { el.scrollTop = 0; });
  await screenshot(page, 'test-results/scene-dialog.png');
  await dialog.getByRole('button', { name: '保存场景', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const sceneRow = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '专注办公', exact: true }) });
  await expect(sceneRow.getByRole('button', { name: '窗口设置', exact: true })).toHaveCount(0);
  await expect(sceneRow.locator('.scene-icon-grid > .target-icon')).toHaveCount(3);
  const launches = () => page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.cmd === 'show_target').map((call: any) => call.config.id));
  const shortcut = () => page.evaluate(() => (window as any).__triggerShortcut('Alt+J'));
  const ids = [showcase[4].id, showcase[0].id, showcase[1].id];
  await shortcut();
  await expect.poll(launches).toEqual(ids);
  await expect(sceneRow.getByText('全部显示', { exact: true })).toBeVisible();
  const memberRow = page.getByRole('article').filter({ has: page.getByRole('heading', { name: names[0], exact: true }) });
  await memberRow.getByRole('button', { name: '隐藏窗口', exact: true }).click();
  await expect(sceneRow.getByText('部分显示', { exact: true })).toBeVisible();
  await shortcut();
  await expect.poll(launches).toEqual([...ids, ...ids]);
  await expect(sceneRow.getByText('全部显示', { exact: true })).toBeVisible();
  await shortcut();
  await expect(sceneRow.getByText('待唤醒', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.cmd === 'hide_target').map((call: any) => call.id))).toEqual(ids);
  await page.getByRole('group', { name: '目标类型' }).getByRole('button', { name: /场景/ }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.setViewportSize({ width: 1120, height: 760 });
  await screenshot(page, 'test-results/scene-details.png');
  await sceneRow.getByRole('button', { name: '编辑', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: names[0], exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: names[0], exact: true }).check();
  await expect(dialog.getByLabel('启动顺序').locator('li')).toHaveText([`1${names[1]}`, `2${names[2]}`, `3${names[0]}`]);
  await dialog.getByRole('button', { name: '保存场景', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(sceneRow).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hudbrowse_url_configs')!).data);
  expect(saved.find((item: UrlConfig) => item.type === 'scene').memberIds).toEqual([ids[1], ids[2], ids[0]]);
  await page.getByRole('button', { name: '收起为灵动岛' }).click();
  await page.setViewportSize({ width: 400, height: 100 });
  const islandScene = page.locator('.compact-target').filter({ has: page.locator('.scene-icon') });
  await islandScene.scrollIntoViewIfNeeded();
  await islandScene.click();
  await expect.poll(launches).toEqual([ids[1], ids[2], ids[0]]);
  await page.getByRole('button', { name: '展开工作台' }).click();
  await page.setViewportSize({ width: 1120, height: 760 });
  await sceneRow.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认移除', exact: true }).click();
  await expect(sceneRow).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(showcase.length);
  expect(await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.cmd === 'remove_target'))).toHaveLength(0);
});

for (const width of [440, 400]) {
  test(`four island icons fit without clipping at ${width}px`, async ({ page }) => {
    await desktopFixture(page, showcase);
    await page.getByRole('button', { name: '收起为灵动岛' }).click();
    await page.setViewportSize({ width, height: 100 });
    await expect(page.locator('.desktop-shell')).not.toHaveAttribute('aria-busy');
    const measurements = await page.locator('.compact-target-scroll').evaluate(el => {
      const rail = el.getBoundingClientRect();
      const targets = [...el.querySelectorAll('.compact-target')].slice(0, 4).map(item => item.getBoundingClientRect());
      const close = document.querySelector('.compact-title .close-button')!.getBoundingClientRect();
      const title = document.querySelector('.compact-title')!.getBoundingClientRect();
      return { fits: targets.every(rect => rect.left >= rail.left && rect.right <= rail.right + .5), railWidth: rail.width, closeFits: close.right <= title.right - 18, noOverflow: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(measurements).toEqual({ fits: true, railWidth: 156, closeFits: true, noOverflow: true });
    await expect(page.locator('.island-status')).not.toContainText('活跃');
    if (width === 440) await screenshot(page, 'test-results/island-compact.png');
  });
}


test('startup restores webpages but desktop launch remains an explicit action', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__restoreSession = ['terminal', 'github']; });
  await desktopFixture(page, showcase);
  const calls = await page.evaluate(() => (window as any).__nativeCalls);
  expect(calls.filter((call: any) => call.cmd === 'show_target').map((call: any) => call.config.id)).toEqual(['github']);
  expect(calls.filter((call: any) => call.cmd === 'apply_target_settings').map((call: any) => call.config.id)).toContain('terminal');
  const row = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Windows Terminal', exact: true }) });
  await row.getByRole('button', { name: '显示窗口', exact: true }).click();
  await expect(row.getByText('显示中', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__nativeCalls.filter((call: any) => call.cmd === 'toggle_target').map((call: any) => call.config.id))).toEqual(['terminal']);
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await page.getByRole('tab', { name: '应用', exact: true }).click();
  await expect(page.getByRole('switch', { name: '恢复上次可见网页', exact: true })).toBeVisible();
});
