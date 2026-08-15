/* ═══════════════════════════════════════════════════════════════════════════
   农历 / 节气 / 节假日 数据模块
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── 农历数据表 (1901-2100) ────────────────────────────────────────────
   每项编码含义：
   - 十六进制转二进制，从高位到低位
   - 第17-20位：闰月月份 (0=无闰月)
   - 第1-16位：每月大小月 (1=30天, 0=29天)，从高位到低位对应正月到十二月/闰月
   数据来源：天文计算通用表 */
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2, // 1901-1910
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977, // 1911-1920
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970, // 1921-1930
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950, // 1931-1940
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557, // 1941-1950
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0, // 1951-1960
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0, // 1961-1970
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6, // 1971-1980
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570, // 1981-1990
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0, // 1991-2000
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5, // 2001-2010
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930, // 2011-2020
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530, // 2021-2030
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45, // 2031-2040
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0, // 2041-2050
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06aa0,0x1a6c4,0x0aae0, // 2051-2060
  0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4, // 2061-2070
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0, // 2071-2080
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160, // 2081-2090
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a4d0,0x0d150,0x0f252, // 2091-2100
  0x0d520
];

/* ─── 天干地支 ─────────────────────────────────────────────────────────── */
const TIAN_GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const DI_ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const SHENG_XIAO = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
const LUNAR_MONTHS = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
const LUNAR_DAYS = [
  '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'
];

/* ─── 农历转换 ─────────────────────────────────────────────────────────── */
function solarToLunar(year, month, day) {
  // 基准日：1901年1月1日 = 农历1900年十一月廿一
  const baseDate = new Date(1901, 0, 1);
  const targetDate = new Date(year, month - 1, day);
  let offset = Math.floor((targetDate - baseDate) / 86400000);
  if (offset < 0 || offset > 72619) return null;

  // 定位农历年
  let lunarYear, lunarMonth, lunarDay, isLeap = false;
  let yearDays = 0, i = 0;

  for (lunarYear = 1901; lunarYear < 2101 && offset > 0; lunarYear++) {
    yearDays = lunarYearDays(lunarYear);
    offset -= yearDays;
    if (offset < 0) { offset += yearDays; break; }
  }
  if (lunarYear > 2100) return null;

  // 闰月
  const leapMonth = leapMonthOf(lunarYear);
  let isLeapMonth = false;

  for (lunarMonth = 1; lunarMonth <= 12 && offset > 0; lunarMonth++) {
    if (leapMonth > 0 && lunarMonth === leapMonth + 1) {
      if (!isLeapMonth) {
        isLeapMonth = true; lunarMonth--;
        const leapDays = leapMonthDays(lunarYear);
        offset -= leapDays;
        if (offset < 0) { offset += leapDays; isLeap = true; break; }
        continue;
      }
    }
    const mDays = lunarMonthDays(lunarYear, lunarMonth);
    offset -= mDays;
    if (offset < 0) { offset += mDays; break; }
  }

  lunarDay = offset + 1;

  // 天干地支
  const ganZhiYear = cyclical(lunarYear - 1900 + 36);
  const ganZhiMonth = cyclical((lunarYear - 1900) * 12 + lunarMonth + 12);
  const ganZhiDay = cyclical(Math.floor((targetDate - new Date(1900, 0, 1)) / 86400000) + 10);
  const shengXiao = SHENG_XIAO[(lunarYear - 4) % 12];

  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeap,
    monthName: (isLeap ? '闰' : '') + LUNAR_MONTHS[lunarMonth - 1] + '月',
    dayName: LUNAR_DAYS[lunarDay - 1],
    ganZhiYear: ganZhiYear.gan + ganZhiYear.zhi,
    ganZhiMonth: ganZhiMonth.gan + ganZhiMonth.zhi,
    ganZhiDay: ganZhiDay.gan + ganZhiDay.zhi,
    shengXiao
  };
}

function lunarYearDays(year) {
  let sum = 348; // 12 * 29
  for (let i = 0x8000; i > 0x8; i >>= 1)
    sum += (LUNAR_INFO[year - 1901] & i) ? 1 : 0;
  return sum + leapMonthDays(year);
}

function leapMonthOf(year) {
  return LUNAR_INFO[year - 1901] & 0xf;
}

function leapMonthDays(year) {
  if (leapMonthOf(year)) return (LUNAR_INFO[year - 1901] & 0x10000) ? 30 : 29;
  return 0;
}

function lunarMonthDays(year, month) {
  return (LUNAR_INFO[year - 1901] & (0x10000 >> month)) ? 30 : 29;
}

function cyclical(num) {
  return {
    gan: TIAN_GAN[num % 10],
    zhi: DI_ZHI[num % 12]
  };
}

/* ─── 节气计算 ────────────────────────────────────────────────────────────
   使用近似公式计算太阳黄经到达特定角度(0,15,30...)的日期 */
const SOLAR_TERMS = [
  '小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨',
  '立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑',
  '白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'
];

function getSolarTerms(year) {
  const terms = [];
  for (let i = 0; i < 24; i++) {
    const date = calcSolarTermDate(year, i);
    if (date) {
      terms.push({
        name: SOLAR_TERMS[i],
        date: `${year}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}`,
        index: i
      });
    }
  }
  return terms;
}

function calcSolarTermDate(year, index) {
  // 使用近似公式计算
  const century = (year - 1900) / 100;
  let angle = index * 15;
  
  // 各节气固定日期近似值
  const baseDays = [
    6, 20, 4, 19, 6, 21, 5, 20, 6, 21, 6, 22,
    7, 23, 8, 23, 8, 23, 8, 24, 7, 23, 7, 22
  ];
  
  let day = baseDays[index];
  let month = Math.floor(index / 2) + 1;
  
  // 简单修正
  if (year >= 2000) {
    if ([0,1,2,3,6,7,8,9,12,13,14,15,18,19,20,21].includes(index)) day -= 1;
    if ([10,11,22,23].includes(index)) day -= 2;
  }
  
  // 边界处理
  if (day < 1) { month--; day += 30; }
  if (month < 1) month = 12;
  
  return { month, day };
}

/* ─── 节假日数据 ─────────────────────────────────────────────────────────── */
const HOLIDAYS_FIXED = {
  // 固定公历节日
  '0101': { name: '元旦', type: 'holiday' },
  '0214': { name: '情人节', type: 'festival' },
  '0308': { name: '妇女节', type: 'festival' },
  '0312': { name: '植树节', type: 'festival' },
  '0401': { name: '愚人节', type: 'festival' },
  '0501': { name: '劳动节', type: 'holiday' },
  '0504': { name: '青年节', type: 'festival' },
  '0601': { name: '儿童节', type: 'festival' },
  '0701': { name: '建党节', type: 'festival' },
  '0801': { name: '建军节', type: 'festival' },
  '0910': { name: '教师节', type: 'festival' },
  '1001': { name: '国庆节', type: 'holiday' },
  '1225': { name: '圣诞节', type: 'festival' }
};

const HOLIDAYS_LUNAR = {
  // 农历节日 (月,日)
  '1,1': { name: '春节', type: 'holiday' },
  '1,15': { name: '元宵节', type: 'festival' },
  '5,5': { name: '端午节', type: 'holiday' },
  '7,7': { name: '七夕节', type: 'festival' },
  '7,15': { name: '中元节', type: 'festival' },
  '8,15': { name: '中秋节', type: 'holiday' },
  '9,9': { name: '重阳节', type: 'festival' },
  '12,8': { name: '腊八节', type: 'festival' },
  '12,30': { name: '除夕', type: 'holiday' }
};

function getHolidayInfo(year, month, day) {
  const key = `${String(month).padStart(2,'0')}${String(day).padStart(2,'0')}`;
  const fixed = HOLIDAYS_FIXED[key];
  if (fixed) return fixed;

  // 农历节日
  const lunar = solarToLunar(year, month, day);
  if (lunar && !lunar.isLeap) {
    const lkey = `${lunar.month},${lunar.day}`;
    const lfest = HOLIDAYS_LUNAR[lkey];
    if (lfest) return lfest;
    // 除夕特殊处理 (腊月廿九或三十)
    if (lunar.month === 12 && (lunar.day === 29 || lunar.day === 30)) {
      // 检查第二天是否为正月初一
      const next = new Date(year, month - 1, day + 1);
      const nextLunar = solarToLunar(next.getFullYear(), next.getMonth() + 1, next.getDate());
      if (nextLunar && nextLunar.month === 1 && nextLunar.day === 1)
        return { name: '除夕', type: 'holiday' };
    }
  }
  return null;
}

/* ─── 导出 ─────────────────────────────────────────────────────────────── */
window.LunarCalendar = {
  solarToLunar,
  getSolarTerms,
  getHolidayInfo,
  SOLAR_TERMS,
  LUNAR_MONTHS
};