const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Tasks
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  addTask: (taskData) => ipcRenderer.invoke('add-task', taskData),
  updateTask: (id, updates) => ipcRenderer.invoke('update-task', { id, updates }),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),
  reorderTasks: (orderedIds) => ipcRenderer.invoke('reorder-tasks', orderedIds),

  // Smart Capture
  smartParse: (text) => ipcRenderer.invoke('smart-parse', text),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),

  // Notifications
  sendNotification: (title, body) => ipcRenderer.invoke('send-notification', { title, body }),

  // Workflows
  getWorkflows: () => ipcRenderer.invoke('get-workflows'),

  // Habits
  getHabits: () => ipcRenderer.invoke('get-habits'),
  saveHabits: (habits) => ipcRenderer.invoke('save-habits', habits),

  // Events from main
  onTasksUpdated: (callback) => {
    const handler = (event, tasks) => callback(tasks);
    ipcRenderer.on('tasks-updated', handler);
    return () => ipcRenderer.removeListener('tasks-updated', handler);
  },
  onThemeChanged: (callback) => {
    const handler = (event, isDark) => callback(isDark);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.removeListener('theme-changed', handler);
  },
  onFocusTask: (callback) => {
    const handler = (event, index) => callback(index);
    ipcRenderer.on('focus-task', handler);
    return () => ipcRenderer.removeListener('focus-task', handler);
  },
  onNewNote: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('new-note', handler);
    return () => ipcRenderer.removeListener('new-note', handler);
  }
});