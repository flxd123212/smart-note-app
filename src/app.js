/* ═══════════════════════════════════════════════════════════════════════════
   智能便签 - 主逻辑
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── State ──────────────────────────────────────────────────────────── */
let tasks = [];
let settings = {};
let habits = [];
let editingTaskId = null;
let dragItem = null;
let selectedDate = null;
let calendarDate = new Date();

/* Pomodoro State */
let pomodoro = {
  isRunning: false,
  timeLeft: 1500, // 25 min in seconds
  mode: 'work', // 'work' | 'break'
  round: 0,
  maxRounds: 4,
  completedCount: 0,
  interval: null
};

/* ─── DOM Shortcuts ──────────────────────────────────────────────────── */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ─── Init ────────────────────────────────────────────────────────────── */
async function init() {
  settings = await window.api.getSettings();
  tasks = await window.api.getTasks();
  habits = await (window.api.getHabits ? window.api.getHabits() : Promise.resolve([]));

  applyTheme(settings.darkMode);
  setupEventListeners();
  renderTasks();
  updateSidebarStats();
  renderCalendar();
  renderStats();
  renderHabits();
  updatePomodoroDisplay();

  window.api.onTasksUpdated((updatedTasks) => {
    tasks = updatedTasks;
    renderTasks();
    updateSidebarStats();
    renderCalendar();
    renderStats();
  });

  window.api.onThemeChanged(() => {
    if (settings.darkMode === 'system') applyTheme('system');
  });

  window.api.onFocusTask((taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      showView('tasks');
      renderTasks();
      const card = document.querySelector(`.task-card[data-id="${taskId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.boxShadow = '0 0 0 3px var(--green-primary), var(--shadow)';
        card.style.transition = 'box-shadow 0.5s';
        setTimeout(() => { card.style.boxShadow = ''; }, 2500);
      }
    }
  });

  window.api.onNewNote(() => openTaskModal());

  // Init weather system
  WeatherSystem.init(settings);

  // Init lunar/calendar data
  window._lunarData = window.LunarCalendar || null;

  // Load settings UI
  $('#settingAutoStart').checked = settings.autoStart || false;
  $('#settingMinimizeToTray').checked = settings.minimizeToTray !== false;
  $('#settingDarkMode').value = settings.darkMode || 'system';
  $('#settingSmartCapture').checked = settings.smartCapture !== false;
  $('#settingReminders').checked = settings.reminders !== false;
  $('#settingNotifyBefore').value = settings.notifyBefore || 15;
  $('#settingSmartSchedule').checked = settings.smartSchedule !== false;
  $('#settingWeatherProvider').value = settings.weatherProvider || 'openmeteo';
  if (settings.weatherApiKey) $('#settingWeatherApiKey').value = settings.weatherApiKey;
}

/* ─── Theme ───────────────────────────────────────────────────────────── */
function applyTheme(mode) {
  const root = document.documentElement;
  root.classList.remove('dark-theme', 'light-theme');
  if (mode === 'dark') root.classList.add('dark-theme');
  else if (mode === 'light') root.classList.add('light-theme');
  // system: let media query handle it
}

/* ─── Sidebar ──────────────────────────────────────────────────────────── */
function updateSidebarStats() {
  const pending = tasks.filter(t => !t.done).length;
  $('#pendingCount').textContent = pending;
}

function showView(viewName) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const view = $(`#view-${viewName}`);
  const nav = $(`.nav-item[data-view="${viewName}"]`);
  if (view) view.classList.add('active');
  if (nav) nav.classList.add('active');

  // Refresh view content
  if (viewName === 'workflow') renderWorkflows();
  if (viewName === 'calendar') { renderCalendar(); fetchWeather(); }
  if (viewName === 'stats') renderStats();
  if (viewName === 'habits') renderHabits();
  if (viewName === 'tasks') { updateRecommendations(); }
}

/* ─── Sparkle Effect ──────────────────────────────────────────────────── */
function createSparkle(x, y) {
  const emojis = ['✨', '🌟', '⭐', '💚', '🌸'];
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div');
    el.className = 'sparkle';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.left = (x + (Math.random() - 0.5) * 60) + 'px';
    el.style.top = (y + (Math.random() - 0.5) * 60) + 'px';
    el.style.fontSize = (0.8 + Math.random() * 0.8) + 'rem';
    el.style.animationDelay = (Math.random() * 0.2) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
}

/* ─── Quick Add ────────────────────────────────────────────────────────── */
async function quickAddTask() {
  const input = $('#quickAddInput');
  const text = input.value.trim();
  if (!text) return;
  await window.api.addTask({ title: text });
  input.value = '';
  showToast('✨ 任务已添加！', 'success');
}

/* ─── Task Rendering ──────────────────────────────────────────────────── */
function renderTasks() {
  const list = $('#taskList');
  const search = ($('#searchInput').value || '').toLowerCase();
  const filterPrio = $('#filterPriority').value;
  const filterStatus = $('#filterStatus').value;

  let filtered = tasks.filter(t => {
    if (filterPrio !== 'all' && t.priority !== filterPrio) return false;
    if (filterStatus === 'done' && !t.done) return false;
    if (filterStatus === 'pending' && t.done) return false;
    if (search) {
      const match = t.title.toLowerCase().includes(search) ||
        (t.note && t.note.toLowerCase().includes(search)) ||
        (t.tags && t.tags.some(tag => tag.toLowerCase().includes(search)));
      if (!match) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.order !== b.order) return a.order - b.order;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <h3>没有匹配的任务</h3>
        <p>尝试调整筛选条件或搜索词</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((task, idx) => {
    const dueStr = task.dueDate ? formatDate(task.dueDate) : '';
    const remindStr = task.reminderTime ? formatDateTime(task.reminderTime) : '';
    const tagsStr = (task.tags || []).map(t => `<span class="tag">#${t}</span>`).join('');
    const prioLabel = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';

    return `
      <div class="task-card ${task.done ? 'done' : ''} ${task.priority}" draggable="true" data-id="${task.id}" style="animation-delay:${idx * 0.04}s">
        <span class="drag-handle">⠿</span>
        <div class="priority-bar"></div>
        <div class="task-check" data-action="toggle"></div>
        <div class="task-info">
          <div class="task-title">${escHtml(task.title)}</div>
          <div class="task-meta">
            ${dueStr ? `<span>📅 ${dueStr}</span>` : ''}
            ${remindStr ? `<span>⏰ ${remindStr}</span>` : ''}
            <span>${prioLabel}</span>
            ${tagsStr}
          </div>
        </div>
        <div class="task-actions">
          <button class="edit-btn" data-action="edit" title="编辑">✏️</button>
          <button class="delete-btn" data-action="delete" title="删除">🗑️</button>
        </div>
      </div>`;
  }).join('');

  // Attach events
  list.querySelectorAll('.task-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      if (action === 'toggle') toggleTask(id, e);
      if (action === 'edit') openTaskModal(id);
      if (action === 'delete') deleteTask(id);
    });
    card.addEventListener('dragstart', (e) => {
      dragItem = id; card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const after = getDragAfterElement(list, e.clientY);
      const dragging = list.querySelector('.dragging');
      if (dragging) after ? list.insertBefore(dragging, after) : list.appendChild(dragging);
    });
  });
  list.addEventListener('drop', (e) => { e.preventDefault(); commitReorder(); });
}

function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll('.task-card:not(.dragging)')];
  return cards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function commitReorder() {
  const orderedIds = [...$$('.task-card:not(.dragging)')].map(c => c.dataset.id);
  tasks = await window.api.reorderTasks(orderedIds);
}

/* ─── Task Operations ─────────────────────────────────────────────────── */
async function toggleTask(id, event) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const newDone = !task.done;
  await window.api.updateTask(id, { done: newDone });
  if (newDone && event) {
    const rect = event.target.getBoundingClientRect();
    createSparkle(rect.left + rect.width / 2, rect.top + rect.height / 2);
    showToast(`✅ "${task.title}" 已完成！`, 'success');
  }
}

async function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  if (!confirm(`确定要删除「${task.title}」吗？`)) return;
  await window.api.deleteTask(id);
  showToast(`已删除「${task.title}」`, 'info');
}

function openTaskModal(taskId = null) {
  editingTaskId = taskId;
  const task = taskId ? tasks.find(t => t.id === taskId) : null;
  $('#modalTitle').textContent = task ? '✏️ 编辑任务' : '✨ 新建任务';
  $('#taskTitle').value = task ? task.title : '';
  $('#taskDueDate').value = task?.dueDate ? task.dueDate.slice(0, 10) : '';
  $('#taskReminderTime').value = task?.reminderTime ? task.reminderTime.slice(0, 16) : '';
  $('#taskPriority').value = task ? task.priority : 'medium';
  $('#taskTags').value = task?.tags ? task.tags.join(', ') : '';
  $('#taskNote').value = task?.note || '';
  $('#smartParseResult').style.display = 'none';

  if (!taskId && settings.smartCapture) {
    $('#taskTitle').oninput = debounce(async () => {
      const text = $('#taskTitle').value;
      if (text.length < 3) { $('#smartParseResult').style.display = 'none'; return; }
      const parsed = await window.api.smartParse(text);
      if (parsed.title) {
        const info = [`📝 ${escHtml(parsed.title)}`];
        if (parsed.dueDate) info.push(`📅 ${formatDate(parsed.dueDate)}`);
        if (parsed.reminderTime) info.push(`⏰ ${formatDateTime(parsed.reminderTime)}`);
        if (parsed.tags.length) info.push(`🏷️ ${parsed.tags.map(t => '#' + t).join(' ')}`);
        $('#parseInfo').innerHTML = info.join('<br>');
        $('#smartParseResult').style.display = 'block';
        if (parsed.dueDate && !$('#taskDueDate').value) $('#taskDueDate').value = parsed.dueDate.slice(0, 10);
        if (parsed.reminderTime && !$('#taskReminderTime').value) $('#taskReminderTime').value = parsed.reminderTime.slice(0, 16);
      }
    }, 300);
  }
  $('#taskModal').classList.add('open');
  setTimeout(() => $('#taskTitle').focus(), 100);
}

async function saveTask() {
  const title = $('#taskTitle').value.trim();
  if (!title) { showToast('请输入任务内容', 'error'); return; }
  const data = {
    title,
    dueDate: $('#taskDueDate').value ? $('#taskDueDate').value + 'T23:59:00' : null,
    reminderTime: $('#taskReminderTime').value ? $('#taskReminderTime').value + ':00' : null,
    priority: $('#taskPriority').value,
    tags: $('#taskTags').value.split(/[,，、]/).map(t => t.trim()).filter(Boolean),
    note: $('#taskNote').value.trim(),
    skipSmartParse: !!editingTaskId
  };
  if (editingTaskId) {
    await window.api.updateTask(editingTaskId, data);
    showToast('✅ 任务已更新', 'success');
  } else {
    const task = await window.api.addTask(data);
    showToast('✨ 任务已创建！', 'success');
    if (settings.smartSchedule && !data.dueDate && !data.reminderTime) {
      scheduleSuggestion(data, task);
    }
  }
  closeTaskModal();
}

function closeTaskModal() {
  $('#taskModal').classList.remove('open');
  editingTaskId = null;
  $('#taskTitle').oninput = null;
}

async function scheduleSuggestion(taskData, newTask) {
  const now = new Date();
  let suggested = new Date(now);
  suggested.setHours(suggested.getHours() + 1, 0, 0, 0);
  const busySlots = tasks.filter(t => t.reminderTime && !t.done).map(t => new Date(t.reminderTime).getTime());
  const isBusy = busySlots.some(t => Math.abs(t - suggested.getTime()) < 3600000);
  if (isBusy) { suggested = new Date(now); suggested.setDate(suggested.getDate() + 1); suggested.setHours(9, 0, 0, 0); }
  if (confirm(`🧠 智能安排：是否将「${taskData.title}」安排在 ${formatDateTime(suggested.toISOString())}？`)) {
    await window.api.updateTask(newTask.id, { dueDate: suggested.toISOString(), reminderTime: suggested.toISOString() });
    showToast(`📅 已安排在 ${formatDateTime(suggested.toISOString())}`, 'success');
  }
}

/* ─── Pomodoro ─────────────────────────────────────────────────────────── */
function updatePomodoroDisplay() {
  const mins = Math.floor(pomodoro.timeLeft / 60);
  const secs = pomodoro.timeLeft % 60;
  $('#pomodoroTimer').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const modeLabel = pomodoro.mode === 'work' ? '🍅 专注中' : '☕ 休息中';
  const statusText = pomodoro.isRunning ? modeLabel : (pomodoro.mode === 'work' ? '🌱 准备开始' : '☕ 休息时间');
  $('#pomodoroStatus').textContent = statusText;
  $('#pomodoroCompletedCount').textContent = pomodoro.completedCount;

  // Update dots
  const dots = $$('.pomodoro-round');
  dots.forEach((dot, i) => {
    dot.className = 'pomodoro-round';
    if (i < pomodoro.round) dot.classList.add('completed');
    if (i === pomodoro.round && pomodoro.isRunning) dot.classList.add('current');
  });
}

function startPomodoro() {
  if (pomodoro.isRunning) return;
  if (pomodoro.timeLeft <= 0) {
    pomodoro.timeLeft = pomodoro.mode === 'work' ? 1500 : 300;
  }
  pomodoro.isRunning = true;
  pomodoro.interval = setInterval(() => {
    pomodoro.timeLeft--;
    updatePomodoroDisplay();
    if (pomodoro.timeLeft <= 0) {
      clearInterval(pomodoro.interval);
      pomodoro.isRunning = false;
      if (pomodoro.mode === 'work') {
        pomodoro.completedCount++;
        pomodoro.round = (pomodoro.round + 1) % pomodoro.maxRounds;
        pomodoro.mode = 'break';
        pomodoro.timeLeft = 300; // 5 min break
        showToast('🍅 番茄完成！休息一下吧 ☕', 'success');
        window.api.sendNotification('🍅 番茄完成！', '专注时间结束，休息一下吧 ☕');
      } else {
        pomodoro.mode = 'work';
        pomodoro.timeLeft = 1500;
        showToast('☕ 休息结束，继续专注！ 🍅', 'info');
        window.api.sendNotification('☕ 休息结束', '该继续工作了！');
      }
      updatePomodoroDisplay();
    }
  }, 1000);
  $('#pomodoroStartBtn').disabled = true;
  $('#pomodoroPauseBtn').disabled = false;
  updatePomodoroDisplay();
}

function pausePomodoro() {
  if (!pomodoro.isRunning) return;
  clearInterval(pomodoro.interval);
  pomodoro.isRunning = false;
  $('#pomodoroStartBtn').disabled = false;
  $('#pomodoroPauseBtn').disabled = true;
  updatePomodoroDisplay();
}

function resetPomodoro() {
  clearInterval(pomodoro.interval);
  pomodoro.isRunning = false;
  pomodoro.mode = 'work';
  pomodoro.timeLeft = 1500;
  $('#pomodoroStartBtn').disabled = false;
  $('#pomodoroPauseBtn').disabled = true;
  updatePomodoroDisplay();
}

/* ─── Habits ───────────────────────────────────────────────────────────── */
function renderHabits() {
  const grid = $('#habitGrid');
  if (!habits || habits.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⭐</span>
        <h3>还没有习惯</h3>
        <p>添加一个习惯，开始每日追踪吧！</p>
      </div>`;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  grid.innerHTML = habits.map(habit => {
    const weekDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const done = (habit.history || []).includes(ds);
      weekDays.push(`<span class="habit-day ${done ? 'done' : ''}">${['日','一','二','三','四','五','六'][d.getDay()]}</span>`);
    }
    const checked = (habit.history || []).includes(today);
    return `
      <div class="habit-card ${checked ? 'checked' : ''}" data-id="${habit.id}" onclick="toggleHabit('${habit.id}')">
        <div class="habit-name">${habit.icon || '🌱'} ${escHtml(habit.name)}</div>
        <div class="habit-streak">🔥 ${habit.streak || 0} 天</div>
        <div class="habit-week">${weekDays.join('')}</div>
      </div>`;
  }).join('');
}

function openHabitModal() {
  $('#habitName').value = '';
  $('#habitModal').classList.add('open');
  setTimeout(() => $('#habitName').focus(), 100);
}

async function saveHabit() {
  const name = $('#habitName').value.trim();
  if (!name) { showToast('请输入习惯名称', 'error'); return; }
  const icon = $('#habitIcon').value;
  const habit = { id: 'h_' + Date.now().toString(36), name, icon, history: [], streak: 0, createdAt: new Date().toISOString() };
  habits.push(habit);
  if (window.api.saveHabits) await window.api.saveHabits(habits);
  $('#habitModal').classList.remove('open');
  renderHabits();
  showToast(`🌟 习惯「${name}」已创建`, 'success');
}

async function toggleHabit(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;
  const today = new Date().toISOString().slice(0, 10);
  if (!habit.history) habit.history = [];
  const idx = habit.history.indexOf(today);
  if (idx > -1) habit.history.splice(idx, 1);
  else habit.history.push(today);
  // Calculate streak
  habit.streak = 0;
  const d = new Date();
  while (true) {
    const ds = d.toISOString().slice(0, 10);
    if (habit.history.includes(ds)) { habit.streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  if (window.api.saveHabits) await window.api.saveHabits(habits);
  renderHabits();
  renderStats();
  const rect = event?.target?.getBoundingClientRect();
  if (rect) createSparkle(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/* ─── Workflow ─────────────────────────────────────────────────────────── */
async function renderWorkflows() {
  const canvas = $('#workflowCanvas');
  const workflows = await window.api.getWorkflows();
  if (workflows.length === 0) {
    canvas.innerHTML = `<div class="empty-state"><span class="empty-icon">🔗</span><h3>还没有工作流程</h3></div>`;
    return;
  }
  canvas.innerHTML = workflows.map(wf => `
    <div class="workflow-group">
      <h3>🔄 ${escHtml(wf.name)} <span style="font-size:0.8rem;color:var(--text-muted);font-weight:400;">(${wf.tasks.length})</span></h3>
      ${wf.tasks.sort((a, b) => a.order - b.order).map((task, idx) => `
        <div class="workflow-card ${task.done ? 'done' : ''}" style="animation-delay:${idx * 0.05}s">
          <div class="wf-step">${idx + 1}</div>
          <div class="task-info" style="flex:1;">
            <div class="task-title" style="${task.done ? 'text-decoration:line-through;opacity:0.6;' : ''}">${escHtml(task.title)}</div>
            <div class="task-meta">${task.dueDate ? `<span>📅 ${formatDate(task.dueDate)}</span>` : ''}</div>
          </div>
          <button class="icon-btn" onclick="toggleTask('${task.id}')" title="${task.done ? '撤回' : '完成'}">${task.done ? '↩️' : '✅'}</button>
        </div>
        ${idx < wf.tasks.length - 1 ? '<div class="workflow-arrow">↓</div>' : ''}
      `).join('')}
    </div>
  `).join('');
}

function openWorkflowModal() {
  $('#workflowName').value = '';
  const select = $('#workflowTaskSelect');
  const available = tasks.filter(t => !t.workflowId && !t.done);
  select.innerHTML = available.length
    ? available.map(t => `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;"><input type="checkbox" value="${t.id}" />${escHtml(t.title)}</label>`).join('')
    : '<p style="color:var(--text-muted);">没有可用的任务</p>';
  $('#workflowModal').classList.add('open');
}

async function saveWorkflow() {
  const name = $('#workflowName').value.trim() || '未命名流程';
  const checked = [...$('#workflowTaskSelect').querySelectorAll('input:checked')].map(c => c.value);
  if (!checked.length) { showToast('请选择至少一个任务', 'error'); return; }
  const wfId = 'wf_' + Date.now().toString(36);
  for (const id of checked) await window.api.updateTask(id, { workflowId: wfId, workflowName: name });
  showToast(`✅ 流程「${name}」已创建`, 'success');
  $('#workflowModal').classList.remove('open');
  renderWorkflows();
}

/* ─── Calendar ─────────────────────────────────────────────────────────── */
function renderCalendar() {
  const grid = $('#calendarGrid');
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  $('#calendarCurrent').textContent = `${year}年${month + 1}月`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

  // 农历信息栏
  const lunarBar = $('#lunarInfoBar');
  if (lunarBar && window._lunarData) {
    const now = new Date();
    const lunar = window._lunarData.solarToLunar(year, month + 1, 1);
    const lunarToday = window._lunarData.solarToLunar(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const terms = window._lunarData.getSolarTerms(year);
    const thisMonthTerms = terms.filter(t => t.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
    
    let info = [];
    if (lunar) info.push(`🌙 ${lunar.monthName}`);
    if (lunarToday) info.push(`📅 今日：${lunarToday.monthName} ${lunarToday.dayName}`);
    if (lunarToday) info.push(`🐭 ${lunarToday.shengXiao}年 [${lunarToday.ganZhiYear}]`);
    if (thisMonthTerms.length) info.push(`🌿 节气：${thisMonthTerms.map(t => t.name).join('、')}`);
    lunarBar.innerHTML = info.map(s => `<span>${s}</span>`).join('');
  } else if (lunarBar) {
    lunarBar.innerHTML = '';
  }

  let html = dayNames.map(d => `<div class="calendar-header-cell">${d}</div>`).join('');
  for (let i = firstDay - 1; i >= 0; i--)
    html += `<div class="calendar-cell other-month"><div class="day-number">${daysInPrev - i}</div></div>`;

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    const isSelected = selectedDate === dateStr;
    const dayTasks = tasks.filter(t => t.dueDate && t.dueDate.startsWith(dateStr));
    
    // 农历日期
    let lunarLabel = '';
    if (window._lunarData) {
      const ld = window._lunarData.solarToLunar(year, month + 1, day);
      if (ld && (ld.day === 1 || ld.day === 15)) {
        lunarLabel = `<span class="lunar-label">${ld.dayName}</span>`;
      }
    }
    
    // 节假日标识
    let holidayLabel = '';
    if (window._lunarData) {
      const h = window._lunarData.getHolidayInfo(year, month + 1, day);
      if (h) {
        holidayLabel = `<span class="holiday-tag ${h.type === 'holiday' ? 'festival' : 'normal'}">${h.name}</span>`;
      }
    }
    
    html += `<div class="calendar-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
      <div class="day-number">${day}</div>
      ${lunarLabel}
      ${holidayLabel}
      <div class="day-dots">${dayTasks.filter(t => !t.done).slice(0, 2).map(t => `<div class="day-dot ${t.priority}"></div>`).join('')}
      ${dayTasks.length > 2 ? `<span style="font-size:0.6rem;color:var(--text-muted);">+${dayTasks.length - 2}</span>` : ''}</div></div>`;
  }

  const total = firstDay + daysInMonth;
  for (let day = 1; day <= (7 - total % 7) % 7; day++)
    html += `<div class="calendar-cell other-month"><div class="day-number">${day}</div></div>`;

  grid.innerHTML = html;
  grid.querySelectorAll('.calendar-cell').forEach(cell => {
    cell.addEventListener('click', () => { selectedDate = cell.dataset.date; renderCalendar(); renderSelectedDateTasks(); });
  });
  if (!selectedDate) { selectedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; renderCalendar(); }
  renderSelectedDateTasks();
}

function renderSelectedDateTasks() {
  const container = $('#selectedDateTasks');
  if (!selectedDate) { $('#selectedDateTitle').textContent = '选择日期查看任务'; container.innerHTML = ''; return; }
  const dayTasks = tasks.filter(t => t.dueDate && t.dueDate.startsWith(selectedDate));
  $('#selectedDateTitle').textContent = `📅 ${selectedDate}（${dayTasks.length} 个任务）`;
  container.innerHTML = dayTasks.length
    ? dayTasks.map(task => `<div class="task-card ${task.done ? 'done' : ''}" style="margin-bottom:6px;cursor:pointer;" onclick="openTaskModal('${task.id}')">
        <div class="task-check" onclick="event.stopPropagation();toggleTask('${task.id}')"></div>
        <div class="task-info"><div class="task-title">${escHtml(task.title)}</div>
        <div class="task-meta">${task.reminderTime ? `⏰ ${formatTime(task.reminderTime)}` : ''}</div></div></div>`).join('')
    : '<p style="color:var(--text-muted);padding:12px;">📭 当天没有任务</p>';
}

/* ─── Statistics ────────────────────────────────────────────────────────── */
function renderStats() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.done).length;
  const rate = total ? Math.round(completed / total * 100) : 0;
  $('#statTotalTasks').textContent = total;
  $('#statCompletedTasks').textContent = completed;
  $('#statCompletionRate').textContent = rate + '%';

  // Streak: consecutive days with at least one completion
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const ds = d.toISOString().slice(0, 10);
    const hasCompletion = tasks.some(t => t.done && t.dueDate && t.dueDate.startsWith(ds));
    if (hasCompletion) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  // Also check habits streak
  if (habits && habits.length) {
    const maxHabitStreak = Math.max(...habits.map(h => h.streak || 0));
    streak = Math.max(streak, maxHabitStreak);
  }
  $('#statStreak').textContent = streak;

  // Weekly chart
  const chart = $('#chartBars');
  const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
  const dayData = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const ds = d.toISOString().slice(0, 10);
    dayData.push(tasks.filter(t => t.dueDate && t.dueDate.startsWith(ds) && !t.done).length);
  }
  const max = Math.max(...dayData, 1);
  chart.innerHTML = dayData.map((count, i) =>
    `<div class="chart-bar" style="height:${count / max * 100}%;">
      <span class="chart-bar-label">${dayNames[i]}<br>${count}</span>
    </div>`
  ).join('');
}

/* ─── Weather ──────────────────────────────────────────────────────────── */
async function fetchWeather(cityName) {
  const panel = $('#weatherPanel');
  if (!panel) return;
  
  try {
    let result;
    if (cityName) {
      result = await WeatherSystem.getWeather(cityName);
    } else if (settings.userLat && settings.userLon && !WeatherSystem.selectedCity) {
      result = await WeatherSystem.getWeather(settings.userLat, settings.userLon);
    } else {
      result = await WeatherSystem.getWeather();
    }
    
    if (!result) { panel.style.display = 'none'; return; }
    
    const { current, forecast } = result;
    if (!current) { panel.style.display = 'none'; return; }
    
    panel.style.display = 'block';
    
    // 无 API Key 提示
    if (current.noKey) {
      $('#weatherIcon').textContent = '🔑';
      $('#weatherTemp').textContent = '--°C';
      $('#weatherDesc').textContent = current.description || '请配置 API Key';
      $('#weatherHumidity').textContent = '--';
      $('#weatherWind').textContent = '--';
      $('#weatherCityName').textContent = current.city || '未配置';
      $('#weatherSuggestions').innerHTML = '<span style="color:var(--pink);">⚠️ 请前往设置 → 天气 &amp; 联网 配置 API Key</span>';
      $('#weatherForecast').innerHTML = '';
      return;
    }
    
    // 错误提示
    if (current.error) {
      $('#weatherIcon').textContent = '⚠️';
      $('#weatherTemp').textContent = '--°C';
      $('#weatherDesc').textContent = current.description || '获取失败';
      $('#weatherCityName').textContent = current.city || '错误';
      $('#weatherSuggestions').innerHTML = `<span>${current.error}</span>`;
      $('#weatherForecast').innerHTML = '';
      return;
    }
    
    // Current weather
    $('#weatherIcon').textContent = WeatherSystem.getWeatherEmoji(current.icon);
    $('#weatherTemp').textContent = `${current.temp}°C`;
    $('#weatherDesc').textContent = current.description;
    $('#weatherHumidity').textContent = current.humidity;
    $('#weatherWind').textContent = current.windSpeed;
    $('#weatherCityName').textContent = current.city || WeatherSystem.selectedCity?.name || '当前位置';
    
    // Suggestions
    const tips = WeatherSystem.getSuggestion(current);
    const sugEl = $('#weatherSuggestions');
    if (tips.length) {
      sugEl.innerHTML = tips.map(t => `<span>${t.icon} ${t.text}</span>`).join(' &nbsp;|&nbsp; ');
    } else {
      sugEl.innerHTML = '';
    }
    
    // Forecast
    const fcEl = $('#weatherForecast');
    if (forecast && forecast.length) {
      fcEl.innerHTML = forecast.map(d => `
        <div style="flex:1;text-align:center;padding:8px;background:var(--glass-bg);border-radius:var(--radius-sm);">
          <div style="font-size:0.75rem;color:var(--text-muted);">${formatDateShort(d.date)}</div>
          <div style="font-size:1.4rem;margin:4px 0;">${WeatherSystem.getWeatherEmoji(d.icon)}</div>
          <div style="font-size:0.8rem;">${d.text || d.textDay || ''}</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);">${Math.round(d.tempMin)}°/${Math.round(d.tempMax)}°</div>
        </div>
      `).join('');
    } else {
      fcEl.innerHTML = '';
    }
    
    // Update recommendations when weather changes too
    updateRecommendations();
    
  } catch (e) {
    console.warn('Weather error:', e);
    panel.style.display = 'none';
  }
}

/* ─── 城市选择器 ──────────────────────────────────────────────────────── */
let cityPickerOpen = false;

function toggleCityPicker() {
  if (cityPickerOpen) { closeCityPicker(); return; }
  
  const citySpan = $('#weatherCity');
  if (!citySpan) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'cityPickerOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999;background:transparent;';
  overlay.addEventListener('click', closeCityPicker);
  
  const cities = WeatherSystem.getCommonCities ? WeatherSystem.getCommonCities() : [];
  
  const picker = document.createElement('div');
  picker.id = 'cityPicker';
  picker.style.cssText = 'position:fixed;z-index:1000;background:var(--glass-bg);backdrop-filter:blur(16px);border-radius:var(--radius);box-shadow:0 8px 40px rgba(0,0,0,0.15);padding:16px;min-width:260px;max-width:320px;max-height:400px;overflow-y:auto;border:1px solid var(--glass-border);';
  
  picker.innerHTML = `
    <div style="font-weight:600;font-size:0.9rem;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      选择城市
      <span style="flex:1;"></span>
      <button class="icon-btn" onclick="closeCityPicker()" style="font-size:0.8rem;">✕</button>
    </div>
    <input type="text" id="citySearchInput" placeholder="搜索城市..."
      style="width:100%;padding:8px 10px;border:1px solid var(--glass-border);border-radius:var(--radius-sm);
      font-size:0.85rem;box-sizing:border-box;background:rgba(255,255,255,0.5);margin-bottom:10px;" />
    <div id="citySearchResults" style="margin-bottom:10px;display:none;">
      <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">搜索结果</div>
      <div id="citySearchList"></div>
    </div>
    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">常用城市</div>
    <div id="commonCityList" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;"></div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--glass-border);">
      <button class="btn btn-secondary btn-small" id="cityPickerLocationBtn" style="width:100%;font-size:0.8rem;">
        📍 自动定位
      </button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  document.body.appendChild(picker);
  
  const rect = citySpan.getBoundingClientRect();
  picker.style.top = Math.min(rect.bottom + 8, window.innerHeight - 420) + 'px';
  picker.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 330)) + 'px';
  
  cityPickerOpen = true;
  
  // 加载常用城市
  const commonList = $('#commonCityList');
  if (commonList) {
    commonList.innerHTML = cities.map(c =>
      `<button onclick="selectCity('${c.name}', ${c.lat}, ${c.lon})"
        style="padding:6px 8px;border:1px solid var(--glass-border);border-radius:6px;
        background:rgba(255,255,255,0.4);cursor:pointer;font-size:0.8rem;transition:all 0.15s;">${c.name}</button>`
    ).join('');
  }
  
  // 搜索
  const searchInput = $('#citySearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(async () => {
      const q = searchInput.value.trim();
      const results = $('#citySearchList');
      const container = $('#citySearchResults');
      if (!q || q.length < 1) { container.style.display = 'none'; return; }
      
      // 先用本地城市过滤
      const local = cities.filter(c => c.name.includes(q));
      if (local.length) {
        container.style.display = 'block';
        results.innerHTML = local.map(c =>
          `<button onclick="selectCity('${c.name}', ${c.lat}, ${c.lon})"
            style="display:block;width:100%;padding:6px 8px;border:none;border-radius:4px;
            background:rgba(255,255,255,0.4);cursor:pointer;font-size:0.82rem;text-align:left;margin-bottom:2px;">${c.name}</button>`
        ).join('');
        return;
      }
      
      // 在线搜索
      container.style.display = 'block';
      results.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);padding:4px;">搜索中...</div>';
      try {
        const coords = await WeatherSystem._searchCity(q);
        if (coords) {
          results.innerHTML = `<button onclick="selectCity('${q}', ${coords.lat}, ${coords.lon})"
            style="display:block;width:100%;padding:6px 8px;border:none;border-radius:4px;
            background:rgba(255,255,255,0.4);cursor:pointer;font-size:0.82rem;text-align:left;">${q}</button>`;
        } else {
          results.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);padding:4px;">未找到该城市</div>';
        }
      } catch(e) {
        results.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);padding:4px;">搜索失败</div>';
      }
    }, 300));
  }
  
  // 定位按钮
  const locBtn = $('#cityPickerLocationBtn');
  if (locBtn) {
    locBtn.addEventListener('click', () => {
      closeCityPicker();
      requestLocation();
    });
  }
}

function closeCityPicker() {
  cityPickerOpen = false;
  const overlay = $('#cityPickerOverlay');
  const picker = $('#cityPicker');
  if (overlay) overlay.remove();
  if (picker) picker.remove();
}

function selectCity(name, lat, lon) {
  WeatherSystem.selectedCity = { name, lat, lon };
  window.api.updateSettings({ selectedCity: { name, lat, lon } });
  closeCityPicker();
  showToast(`📍 已切换到 ${name}`, 'success');
  fetchWeather(name);
}

/* ─── Smart Recommendations ───────────────────────────────────────────── */
async function updateRecommendations() {
  const panel = $('#recommendPanel');
  const list = $('#recommendList');
  if (!panel || !list) return;
  
  const weather = WeatherSystem.currentWeather;
  const now = new Date();
  
  // Check what holidays/today info we have
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  
  // Lunar info
  let lunarInfo = null;
  if (window._lunarData) {
    const lunar = window._lunarData.solarToLunar(now.getFullYear(), now.getMonth() + 1, now.getDate());
    if (lunar) {
      lunarInfo = {
        lunarDate: `${lunar.monthName} ${lunar.dayName}`,
        ganZhi: `${lunar.ganZhiYear}年 ${lunar.ganZhiMonth}月 ${lunar.ganZhiDay}日`,
        shengXiao: lunar.shengXiao
      };
    }
    // Check solar term
    const terms = window._lunarData.getSolarTerms(now.getFullYear());
    const todayTerm = terms.find(t => t.date === today);
    if (todayTerm) {
      lunarInfo.solarTermToday = todayTerm.name;
      const termDescs = {
        '立春': '万物复苏，适宜播种计划', '雨水': '春雨绵绵，注意保湿',
        '惊蛰': '春雷乍动，万物生长', '春分': '昼夜平分，保持平衡',
        '清明': '天气晴朗，适宜踏青', '谷雨': '雨生百谷，播种希望',
        '立夏': '夏季开始，注意养心', '小满': '麦类灌浆，小得盈满',
        '芒种': '有芒作物成熟', '夏至': '日影最短，注意防暑',
        '小暑': '暑气渐浓，注意降温', '大暑': '炎热至极，注意防暑',
        '立秋': '秋季开始，注意润燥', '处暑': '暑气渐消，秋意渐浓',
        '白露': '天气转凉，注意添衣', '秋分': '昼夜平分，秋高气爽',
        '寒露': '露水渐寒，注意保暖', '霜降': '开始有霜，注意防寒',
        '立冬': '冬季开始，注意收藏', '小雪': '开始降雪，注意保暖',
        '大雪': '雪量增大，注意路滑', '冬至': '日影最长，注意进补',
        '小寒': '寒气渐浓，注意保暖', '大寒': '寒冷至极，注意防寒'
      };
      lunarInfo.solarTermDesc = termDescs[todayTerm.name] || '节气养生';
    }
  }
  
  // Holidays
  const holidays = [];
  if (window._lunarData) {
    const h = window._lunarData.getHolidayInfo(now.getFullYear(), now.getMonth() + 1, now.getDate());
    if (h) holidays.push(h);
  }
  
  // Generate recommendations
  const recs = SmartRecommend.getDailyRecommendation(tasks, habits, weather, lunarInfo, holidays);
  
  if (recs.length === 0) {
    panel.style.display = 'none';
    return;
  }
  
  panel.style.display = 'block';
  
  // Show lunar info if available
  let headerExtra = '';
  if (lunarInfo) {
    headerExtra = `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">
      ${lunarInfo.lunarDate} · ${lunarInfo.ganZhi} · 🐭 ${lunarInfo.shengXiao}年
    </div>`;
  }
  
  list.innerHTML = headerExtra + recs.map(r => `
    <div class="recommend-item" style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:4px;border-radius:var(--radius-sm);background:var(--glass-bg);cursor:${r.action ? 'pointer' : 'default'};transition:background 0.2s;"
      ${r.action ? `data-action="${r.action}" data-action-data='${JSON.stringify(r.actionData || '')}'` : ''}>
      <span style="font-size:1.3rem;">${r.icon}</span>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:0.85rem;">${r.title}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);">${r.desc}</div>
      </div>
      ${r.priority === 'high' ? '<span style="font-size:0.65rem;padding:2px 6px;background:#FF6B9D22;color:var(--pink);border-radius:4px;">重要</span>' : ''}
    </div>
  `).join('');
  
  // Add click handlers for actionable items
  list.querySelectorAll('.recommend-item[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      const data = el.dataset.actionData;
      if (action === 'view-tasks') showView('tasks');
      else if (action === 'view-habits') showView('habits');
      else if (action === 'add-task' && data) {
        $('#quickAddInput').value = data;
        quickAddTask();
      }
      else if (action === 'add-habit' && data) {
        // Navigate to habits section
        showView('habits');
      }
    });
  });
}

/* ─── Location ──────────────────────────────────────────────────────────── */
function requestLocation() {
  if (!navigator.geolocation) {
    showToast('⚠️ 浏览器不支持定位', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      settings.userLat = lat;
      settings.userLon = lon;
      await window.api.updateSettings({ userLat: lat, userLon: lon });
      showToast(`📍 已获取位置 (${lat.toFixed(2)}, ${lon.toFixed(2)})`, 'success');
      fetchWeather();
    },
    (err) => {
      showToast('⚠️ 定位失败，使用默认位置', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* ─── Formatting Helpers (lunar) ─────────────────────────────────────────── */
function formatDateShort(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ─── Settings ──────────────────────────────────────────────────────────── */
async function saveSetting(key, value) {
  settings[key] = value;
  await window.api.updateSettings({ [key]: value });
  if (key === 'darkMode') applyTheme(value);
  if (key === 'autoStart') showToast(value ? '🔄 已开启开机自启动' : '🔄 已关闭开机自启动', 'info');
}

/* ─── Toast ────────────────────────────────────────────────────────────── */
function showToast(message, type = 'info') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

/* ─── Utilities ────────────────────────────────────────────────────────── */
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatDateTime(iso) {
  const d = new Date(iso);
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function escHtml(str) {
  const div = document.createElement('div'); div.textContent = str; return div.innerHTML;
}
function debounce(fn, ms) {
  let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

/* ─── Event Listeners ──────────────────────────────────────────────────── */
function setupEventListeners() {
  // Navigation
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => showView(item.dataset.view));
  });

  // Sidebar toggle
  $('#toggleSidebarBtn').addEventListener('click', () => {
    $('#sidebar').classList.toggle('collapsed');
    $('#toggleSidebarBtn').textContent = $('#sidebar').classList.contains('collapsed') ? '▶' : '◀';
  });

  

  // Quick Add
  $('#quickAddBtn').addEventListener('click', quickAddTask);
  $('#quickAddInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') quickAddTask(); });

  // Task add
  $('#addTaskBtn').addEventListener('click', () => openTaskModal());

  // Search / Filters
  $('#searchInput').addEventListener('input', renderTasks);
  $('#filterPriority').addEventListener('change', renderTasks);
  $('#filterStatus').addEventListener('change', renderTasks);

  // Modal task
  $('#modalCloseBtn').addEventListener('click', closeTaskModal);
  $('#modalCancelBtn').addEventListener('click', closeTaskModal);
  $('#modalSaveBtn').addEventListener('click', saveTask);
  $('#taskModal').addEventListener('click', (e) => { if (e.target === $('#taskModal')) closeTaskModal(); });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeTaskModal(); $('#workflowModal').classList.remove('open'); $('#habitModal').classList.remove('open'); }
  });

  // Workflow
  $('#addWorkflowBtn').addEventListener('click', openWorkflowModal);
  $('#workflowModalCloseBtn').addEventListener('click', () => $('#workflowModal').classList.remove('open'));
  $('#workflowModalCancelBtn').addEventListener('click', () => $('#workflowModal').classList.remove('open'));
  $('#workflowModalSaveBtn').addEventListener('click', saveWorkflow);

  // Calendar
  $('#calendarPrevBtn').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
  $('#calendarNextBtn').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
  $('#calendarTodayBtn').addEventListener('click', () => { calendarDate = new Date(); renderCalendar(); });
  
  // City picker
  $('#weatherCity').addEventListener('click', toggleCityPicker);

  // Pomodoro
  $('#pomodoroStartBtn').addEventListener('click', startPomodoro);
  $('#pomodoroPauseBtn').addEventListener('click', pausePomodoro);
  $('#pomodoroResetBtn').addEventListener('click', resetPomodoro);

  // Habits
  $('#addHabitBtn').addEventListener('click', openHabitModal);
  $('#habitModalCloseBtn').addEventListener('click', () => $('#habitModal').classList.remove('open'));
  $('#habitModalCancelBtn').addEventListener('click', () => $('#habitModal').classList.remove('open'));
  $('#habitModalSaveBtn').addEventListener('click', saveHabit);
  $('#habitModal').addEventListener('click', (e) => { if (e.target === $('#habitModal')) $('#habitModal').classList.remove('open'); });

  // Settings
  $('#settingAutoStart').addEventListener('change', (e) => saveSetting('autoStart', e.target.checked));
  $('#settingMinimizeToTray').addEventListener('change', (e) => saveSetting('minimizeToTray', e.target.checked));
  $('#settingDarkMode').addEventListener('change', (e) => saveSetting('darkMode', e.target.value));
  $('#settingSmartCapture').addEventListener('change', (e) => saveSetting('smartCapture', e.target.checked));
  $('#settingReminders').addEventListener('change', (e) => saveSetting('reminders', e.target.checked));
  $('#settingNotifyBefore').addEventListener('change', (e) => saveSetting('notifyBefore', parseInt(e.target.value)));
  $('#settingSmartSchedule').addEventListener('change', (e) => saveSetting('smartSchedule', e.target.checked));

  // Weather settings
  $('#settingWeatherProvider').addEventListener('change', async (e) => {
    await saveSetting('weatherProvider', e.target.value);
    WeatherSystem.init(settings);
    fetchWeather();
  });
  $('#settingWeatherApiKey').addEventListener('change', async (e) => {
    await saveSetting('weatherApiKey', e.target.value);
    WeatherSystem.init(settings);
    fetchWeather();
  });
  $('#requestLocationBtn').addEventListener('click', requestLocation);
}

/* ─── Start ────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);