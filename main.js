const { app, BrowserWindow, ipcMain, Tray, Menu, nativeTheme, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Data Storage ───────────────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const dataFile = path.join(userDataPath, 'tasks.json');
const settingsFile = path.join(userDataPath, 'settings.json');
const habitsFile = path.join(userDataPath, 'habits.json');

let tasks = [];
let habits = [];
let settings = {
  autoStart: false,
  darkMode: 'system', // 'system' | 'light' | 'dark'
  reminders: true,
  smartCapture: true,
  notifyBefore: 15, // minutes
  minimizeToTray: true,
  smartSchedule: true
};

function loadData() {
  try {
    if (fs.existsSync(dataFile)) {
      tasks = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    }
  } catch (e) { tasks = []; }
  try {
    if (fs.existsSync(settingsFile)) {
      settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf-8')) };
    }
  } catch (e) { /* use defaults */ }
  try {
    if (fs.existsSync(habitsFile)) {
      habits = JSON.parse(fs.readFileSync(habitsFile, 'utf-8'));
    }
  } catch (e) { habits = []; }
}

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(tasks, null, 2));
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  fs.writeFileSync(habitsFile, JSON.stringify(habits, null, 2));
}

// ─── Auto-Start ────────────────────────────────────────────────────────
function applyAutoStart() {
  app.setLoginItemSettings({
    openAtLogin: settings.autoStart,
    path: app.getPath('exe'),
    args: []
  });
}

// ─── Reminder Timer ────────────────────────────────────────────────────
let reminderInterval = null;

function startReminderChecker() {
  if (reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(() => {
    if (!settings.reminders) return;
    const now = Date.now();
    tasks.forEach((task, index) => {
      if (task.done || !task.reminderTime || task.reminded) return;
      const remindAt = new Date(task.reminderTime).getTime();
      if (remindAt <= now && remindAt > now - 60000) {
        // Send notification
        const notification = new Notification({
          title: '⏰ 任务提醒',
          body: `"${task.title}" 的提醒时间到了！`,
          silent: false,
          icon: path.join(__dirname, 'assets', 'icon.png')
        });
        notification.on('click', () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('focus-task', task.id);
          }
        });
        notification.show();
        task.reminded = true;
        saveData();
        if (mainWindow) mainWindow.webContents.send('tasks-updated', tasks);
      }
    });
  }, 15000); // Check every 15 seconds
}

// ─── Smart Capture Analysis ───────────────────────────────────────────
function smartParse(text) {
  // Extract potential date/time info
  const result = { title: text.trim(), dueDate: null, reminderTime: null, priority: 'medium', tags: [] };

  // Date patterns
  const datePatterns = [
    // "明天", "后天", "今天"
    { regex: /今天/, handler: () => { const d = new Date(); d.setHours(23, 59, 0, 0); return d; } },
    { regex: /明天/, handler: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 0, 0); return d; } },
    { regex: /后天/, handler: () => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(23, 59, 0, 0); return d; } },
    // "下周一" etc.
    { regex: /下个?(周一|周二|周三|周四|周五|周六|周日|星期[一二三四五六日天])/, handler: (m) => {
      const dayMap = {'周一':1,'周二':2,'周三':3,'周四':4,'周五':5,'周六':6,'周日':7,'周天':7,'星期':0};
      let dayName = m[1];
      const targetDay = dayMap[dayName];
      if (!targetDay) return null;
      const d = new Date();
      const currentDay = d.getDay() || 7;
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      d.setHours(23, 59, 0, 0);
      return d;
    }},
    // "MM月DD日"
    { regex: /(\d{1,2})月(\d{1,2})[日号]/, handler: (m) => {
      const d = new Date();
      d.setMonth(parseInt(m[1]) - 1, parseInt(m[2]));
      d.setHours(23, 59, 0, 0);
      return d;
    }},
    // "YYYY-MM-DD"
    { regex: /(\d{4})-(\d{1,2})-(\d{1,2})/, handler: (m) => {
      const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), 23, 59, 0, 0);
      return d;
    }}
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const date = pattern.handler(match);
      if (date && !isNaN(date.getTime())) {
        result.dueDate = date.toISOString();
        break;
      }
    }
  }

  // Time patterns (HH:MM)
  const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(?:am|pm)?/i);
  if (timeMatch) {
    const baseDate = result.dueDate ? new Date(result.dueDate) : new Date();
    baseDate.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
    if (baseDate < new Date()) baseDate.setDate(baseDate.getDate() + 1);
    result.reminderTime = baseDate.toISOString();
    if (!result.dueDate) result.dueDate = baseDate.toISOString();
  }

  // Priority detection
  if (/紧急|重要|高优先级|!\s*!/.test(text)) result.priority = 'high';
  else if (/低优先级|随意|有空/.test(text)) result.priority = 'low';
  else result.priority = 'medium';

  // Tag detection (#tag)
  const tagMatch = text.match(/#(\S+)/g);
  if (tagMatch) {
    result.tags = tagMatch.map(t => t.slice(1));
    // Remove tags from title
    result.title = result.title.replace(/#\S+/g, '').trim();
  }

  // Clean title
  result.title = result.title.replace(/(今天|明天|后天|下个?[周星期][一二三四五六日天]?|\d{1,2}月\d{1,2}[日号]|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}:\d{2}\s*(?:am|pm)?)/gi, '').trim();
  // Collapse spaces
  result.title = result.title.replace(/\s+/g, ' ').trim();

  if (!result.title) result.title = text.trim();

  return result;
}

// ─── Window ────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: '智能便签',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    backgroundColor: '#f5f5f5'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray
  mainWindow.on('close', (event) => {
    if (settings.minimizeToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 确保窗口存在并显示（窗口被真正关闭后，从托盘/二次启动中重新创建）
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  // 使用 assets/icon.ico 作为托盘图标（Windows 托盘为 16x16，缩放保证清晰）
  let trayIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico'));
  if (process.platform === 'win32') {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }
  if (trayIcon.isEmpty()) {
    // 图标加载失败时退化为程序绘制的绿色圆点
    const size = 16;
    const buf = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - size / 2 + 0.5, dy = y - size / 2 + 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist < 6) {
          buf[idx] = 76;     // R
          buf[idx + 1] = 198; // G
          buf[idx + 2] = 87;  // B
          buf[idx + 3] = 255; // A
        } else {
          buf[idx] = 0;
          buf[idx + 1] = 0;
          buf[idx + 2] = 0;
          buf[idx + 3] = 0;
        }
      }
    }
    trayIcon = nativeImage.createFromBuffer(buf, { width: size, height: size });
  }
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { showMainWindow(); } },
    { label: '新建便签', click: () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow.show();
          mainWindow.webContents.send('new-note');
        });
      } else {
        mainWindow.show();
        mainWindow.webContents.send('new-note');
      }
    }},
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('智能便签');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow(); // 窗口被真正关闭后，点击托盘重新创建并显示
    } else {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// ─── IPC Handlers ──────────────────────────────────────────────────────
function setupIPC() {
  // ── Tasks ──
  ipcMain.handle('get-tasks', () => tasks);

  ipcMain.handle('add-task', (event, taskData) => {
    const task = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: taskData.title,
      note: taskData.note || '',
      dueDate: taskData.dueDate || null,
      reminderTime: taskData.reminderTime || null,
      priority: taskData.priority || 'medium',
      tags: taskData.tags || [],
      done: false,
      reminded: false,
      order: tasks.length,
      createdAt: new Date().toISOString(),
      workflowId: taskData.workflowId || null
    };
    if (settings.smartCapture && !taskData.skipSmartParse) {
      const parsed = smartParse(taskData.title);
      task.title = parsed.title;
      task.dueDate = parsed.dueDate || task.dueDate;
      task.reminderTime = parsed.reminderTime || task.reminderTime;
      task.priority = parsed.priority;
      task.tags = [...new Set([...task.tags, ...parsed.tags])];
    }
    tasks.push(task);
    saveData();
    if (mainWindow) mainWindow.webContents.send('tasks-updated', tasks);
    return task;
  });

  ipcMain.handle('update-task', (event, { id, updates }) => {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    tasks[idx] = { ...tasks[idx], ...updates };
    saveData();
    if (mainWindow) mainWindow.webContents.send('tasks-updated', tasks);
    return tasks[idx];
  });

  ipcMain.handle('delete-task', (event, id) => {
    tasks = tasks.filter(t => t.id !== id);
    saveData();
    if (mainWindow) mainWindow.webContents.send('tasks-updated', tasks);
    return true;
  });

  ipcMain.handle('reorder-tasks', (event, orderedIds) => {
    const taskMap = {};
    tasks.forEach(t => taskMap[t.id] = t);
    tasks = orderedIds.map((id, idx) => {
      if (taskMap[id]) {
        taskMap[id].order = idx;
        return taskMap[id];
      }
      return null;
    }).filter(Boolean);
    saveData();
    if (mainWindow) mainWindow.webContents.send('tasks-updated', tasks);
    return tasks;
  });

  // ── Smart Capture ──
  ipcMain.handle('smart-parse', (event, text) => smartParse(text));

  // ── Settings ──
  ipcMain.handle('get-settings', () => settings);

  ipcMain.handle('update-settings', (event, newSettings) => {
    settings = { ...settings, ...newSettings };
    saveData();
    applyAutoStart();
    return settings;
  });

  // ── Notifications ──
  ipcMain.handle('send-notification', (event, { title, body }) => {
    const notification = new Notification({ title, body });
    notification.show();
    return true;
  });

  // ── Workflow ──
  ipcMain.handle('get-workflows', () => {
    const workflows = [];
    const wfMap = {};
    tasks.forEach(t => {
      if (t.workflowId) {
        if (!wfMap[t.workflowId]) {
          wfMap[t.workflowId] = { id: t.workflowId, name: t.workflowName || '未命名流程', tasks: [] };
          workflows.push(wfMap[t.workflowId]);
        }
        wfMap[t.workflowId].tasks.push(t);
      }
    });
    return workflows;
  });

  // ── Habits ──
  ipcMain.handle('get-habits', () => habits);

  ipcMain.handle('save-habits', (event, newHabits) => {
    habits = newHabits;
    saveData();
    return habits;
  });

  // ── Auto-start check ──
  ipcMain.handle('is-auto-start-enabled', () => {
    return app.getLoginItemSettings().openAtLogin;
  });
}

// ─── Single Instance Lock ───────────────────────────────────────────────
// 只允许一个实例：重复点击 exe 时聚焦已有窗口/后台，而不是再开一个进程
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  // ─── App Lifecycle ─────────────────────────────────────────────────────
  app.whenReady().then(() => {
    loadData();
    applyAutoStart();
    setupIPC();
    createWindow();
    createTray();
    startReminderChecker();

    // Follow system dark mode
    nativeTheme.on('updated', () => {
      if (mainWindow && settings.darkMode === 'system') {
        mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
      }
    });

    app.on('activate', () => {
      if (mainWindow === null) createWindow();
      else mainWindow.show();
    });
  });
}

app.on('window-all-closed', () => {
  // 未开启“最小化到系统托盘”时，所有窗口关闭后彻底退出
  if (process.platform !== 'darwin' && !settings.minimizeToTray) {
    app.isQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (reminderInterval) clearInterval(reminderInterval);
});