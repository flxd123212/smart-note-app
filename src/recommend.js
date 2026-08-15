/* ═══════════════════════════════════════════════════════════════════════════
   智能推荐模块
   ═══════════════════════════════════════════════════════════════════════════ */

const SmartRecommend = {
  /* ─── 获取今日推荐 ──────────────────────────────────────────────────── */
  getDailyRecommendation(tasks, habits, weather, lunarInfo, holidays) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hour = now.getHours();
    const recommendations = [];

    // 1️⃣ 天气相关推荐
    if (weather) {
      const t = weather.temp;
      const desc = weather.description || '';
      
      if (desc.includes('雨') || desc.includes('雨')) {
        recommendations.push({
          icon: '📖',
          title: '室内活动推荐',
          desc: '下雨天适合读书、整理文档或学习新技能',
          priority: 'medium',
          action: 'add-task',
          actionData: '整理知识笔记'
        });
      }
      if (t > 30) {
        recommendations.push({
          icon: '🏊',
          title: '避暑建议',
          desc: '天气炎热，建议安排游泳或室内运动',
          priority: 'low',
          action: 'add-task',
          actionData: '去游泳放松'
        });
      }
      if (t >= 18 && t <= 28 && !desc.includes('雨')) {
        recommendations.push({
          icon: '🚶',
          title: '户外好时机',
          desc: '天气宜人，适合户外散步或跑步',
          priority: 'medium',
          action: 'add-habit',
          actionData: '户外运动'
        });
      }
    }

    // 2️⃣ 节假日相关推荐
    if (holidays) {
      for (const h of holidays) {
        if (h.type === 'holiday') {
          recommendations.push({
            icon: '🎉',
            title: `${h.name}提醒`,
            desc: `今天是${h.name}，记得安排休息和庆祝 🎊`,
            priority: 'high',
            action: null
          });
        } else {
          recommendations.push({
            icon: '💐',
            title: `${h.name}`,
            desc: `今天是${h.name}，可以准备一份小惊喜哦`,
            priority: 'low',
            action: null
          });
        }
      }
    }

    // 3️⃣ 节气相关推荐
    if (lunarInfo && lunarInfo.solarTermToday) {
      recommendations.push({
        icon: '🍵',
        title: `今日${lunarInfo.solarTermToday}`,
        desc: lunarInfo.solarTermDesc || '注意节气养生',
        priority: 'medium',
        action: null
      });
    }

    // 4️⃣ 任务相关推荐
    const pendingTasks = tasks.filter(t => !t.done);
    const overdueTasks = pendingTasks.filter(t => t.dueDate && t.dueDate < today);
    const dueTodayTasks = pendingTasks.filter(t => t.dueDate && t.dueDate.startsWith(today));
    const noTimeTasks = pendingTasks.filter(t => !t.dueDate);

    if (overdueTasks.length > 0) {
      recommendations.push({
        icon: '⚠️',
        title: `超期任务 (${overdueTasks.length})`,
        desc: `有 ${overdueTasks.length} 个任务已过期，请尽快处理`,
        priority: 'high',
        action: 'view-tasks',
        actionData: null
      });
    }

    if (dueTodayTasks.length === 0 && hour < 12 && pendingTasks.length > 0) {
      recommendations.push({
        icon: '🎯',
        title: '规划建议',
        desc: `今天还没有安排任务，从待办中选择一个开始吧`,
        priority: 'medium',
        action: 'view-tasks',
        actionData: null
      });
    }

    if (dueTodayTasks.length > 0 && hour > 16) {
      recommendations.push({
        icon: '🏁',
        title: '今日收尾',
        desc: `今天还有 ${dueTodayTasks.length} 个任务未完成，加油！`,
        priority: 'high',
        action: 'view-tasks',
        actionData: null
      });
    }

    if (pendingTasks.length === 0) {
      recommendations.push({
        icon: '🎉',
        title: '全部完成！',
        desc: '所有任务已完成，今天真棒！奖励自己一下吧 🌟',
        priority: 'low',
        action: null
      });
    }

    // 5️⃣ 时间相关推荐
    if (hour >= 6 && hour <= 8) {
      recommendations.push({
        icon: '🌅',
        title: '早安！',
        desc: '新的一天开始啦，先规划今日重点任务吧',
        priority: 'medium',
        action: null
      });
    } else if (hour >= 12 && hour <= 13) {
      recommendations.push({
        icon: '🍚',
        title: '午休时间',
        desc: '该吃午饭了，休息一下下午效率更高',
        priority: 'low',
        action: null
      });
    } else if (hour >= 21 || hour <= 5) {
      recommendations.push({
        icon: '🌙',
        title: '该休息了',
        desc: '已经很晚了，注意休息，明天再继续吧',
        priority: 'low',
        action: null
      });
    }

    // 6️⃣ 习惯提醒
    if (habits && habits.length > 0) {
      const uncheckedHabits = habits.filter(h => {
        const todayStr = new Date().toISOString().slice(0, 10);
        return !(h.history || []).includes(todayStr);
      });
      if (uncheckedHabits.length > 0) {
        recommendations.push({
          icon: '⭐',
          title: `习惯打卡 (${uncheckedHabits.length})`,
          desc: `还有 ${uncheckedHabits.length} 个习惯未打卡：${uncheckedHabits.map(h => h.name).join('、')}`,
          priority: 'medium',
          action: 'view-habits',
          actionData: null
        });
      }
    }

    // 按优先级排序
    const prioOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => prioOrder[a.priority] - prioOrder[b.priority]);

    // 限制数量
    return recommendations.slice(0, 6);
  },

  /* ─── 空闲时段推荐 ──────────────────────────────────────────────────── */
  findFreeSlots(tasks, date) {
    const dayStart = date ? new Date(date) : new Date();
    dayStart.setHours(8, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(22, 0, 0, 0);

    const busySlots = tasks
      .filter(t => !t.done && t.reminderTime)
      .map(t => {
        const start = new Date(t.reminderTime);
        const end = new Date(start);
        end.setHours(end.getHours() + 1);
        return { start, end };
      })
      .filter(s => s.start >= dayStart && s.start < dayEnd);

    const freeSlots = [];
    let cursor = new Date(dayStart);

    // 排序繁忙时段
    busySlots.sort((a, b) => a.start - b.start);

    for (const slot of busySlots) {
      if (cursor < slot.start) {
        const diff = (slot.start - cursor) / 3600000;
        if (diff >= 0.5) {
          freeSlots.push({
            start: new Date(cursor),
            end: new Date(slot.start),
            duration: Math.round(diff * 10) / 10
          });
        }
      }
      cursor = new Date(Math.max(cursor, slot.end));
    }

    // 最后一段空闲
    if (cursor < dayEnd) {
      const diff = (dayEnd - cursor) / 3600000;
      if (diff >= 0.5) {
        freeSlots.push({
          start: new Date(cursor),
          end: new Date(dayEnd),
          duration: Math.round(diff * 10) / 10
        });
      }
    }

    return freeSlots;
  }
};

window.SmartRecommend = SmartRecommend;