/* ═══════════════════════════════════════════════════════════════════════════
   天气系统模块（无需 API Key 也可用）
   默认使用 Open-Meteo（免费开源，无需 Key）
   可选：OpenWeatherMap / 和风天气（需 Key）
   ═══════════════════════════════════════════════════════════════════════════ */

const WeatherSystem = {
  provider: 'openmeteo', // openmeteo(默认免key) | openweather | hefeng
  apiKey: '',
  currentWeather: null,
  forecast: [],
  cacheTime: 0,
  cacheDuration: 30 * 60 * 1000,
  selectedCity: null,

  /* ─── 初始化 ─────────────────────────────────────────────────────────── */
  init(settings) {
    this.provider = settings.weatherProvider || 'openmeteo';
    this.apiKey = settings.weatherApiKey || '';
    if (settings.selectedCity) this.selectedCity = settings.selectedCity;
    if (settings.weatherData) {
      this.currentWeather = settings.weatherData.current;
      this.forecast = settings.weatherData.forecast || [];
      this.cacheTime = settings.weatherData.cacheTime || 0;
    }
  },

  /* ─── 获取天气 ──────────────────────────────────────────────────────── */
  async getWeather(cityNameOrLat, optionalLon) {
    let lat, lon;
    let cityChanged = false;

    // 检查是否切换了城市
    if (typeof cityNameOrLat === 'string' && cityNameOrLat.trim()) {
      // 传入城市名 → 肯定要刷新
      cityChanged = true;
    } else if (optionalLon !== undefined) {
      // 传入新坐标
      if (this.selectedCity && (Math.abs(this.selectedCity.lat - cityNameOrLat) > 0.01 || Math.abs(this.selectedCity.lon - optionalLon) > 0.01)) {
        cityChanged = true;
      }
    }

    // 只有未切换城市且缓存有效时才用缓存
    if (!cityChanged && this.currentWeather && Date.now() - this.cacheTime < this.cacheDuration) {
      return { current: this.currentWeather, forecast: this.forecast };
    }

    if (optionalLon !== undefined) {
      lat = cityNameOrLat;
      lon = optionalLon;
    } else if (typeof cityNameOrLat === 'string' && cityNameOrLat.trim()) {
      const coords = await this._searchCity(cityNameOrLat);
      if (!coords) return null;
      lat = coords.lat;
      lon = coords.lon;
      this.selectedCity = { name: cityNameOrLat, lat, lon };
    } else {
      if (this.selectedCity) {
        lat = this.selectedCity.lat;
        lon = this.selectedCity.lon;
      } else {
        lat = 39.9;
        lon = 116.4;
        this.selectedCity = { name: '北京', lat, lon };
      }
    }

    let result;
    switch (this.provider) {
      case 'openweather':
        result = await this._fetchOpenWeather(lat, lon);
        break;
      case 'hefeng':
        result = await this._fetchHefeng(lat, lon);
        break;
      default:
        result = await this._fetchOpenMeteo(lat, lon);
    }

    if (result) {
      this.currentWeather = result.current;
      this.forecast = result.forecast || [];
      this.cacheTime = Date.now();
      window.api.updateSettings({
        weatherData: { current: result.current, forecast: result.forecast, cacheTime: this.cacheTime },
        selectedCity: this.selectedCity
      });
    }
    return result;
  },

  /* ─── Open-Meteo（免费开源，无需 API Key） ──────────────────────────── */
  async _fetchOpenMeteo(lat, lon) {
    try {
      // 当前天气 + 每日预报
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max` +
        `&forecast_days=4&timezone=auto`;
      
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Open-Meteo API error: ' + resp.status);
      const data = await resp.json();

      // WMO 天气代码 → 中文描述 + 图标
      const wmoMap = {
        0: { desc: '晴天', icon: '01d' },
        1: { desc: '少云', icon: '02d' },
        2: { desc: '多云', icon: '03d' },
        3: { desc: '阴天', icon: '04d' },
        45: { desc: '雾', icon: '50d' },
        48: { desc: '雾凇', icon: '50d' },
        51: { desc: '小毛毛雨', icon: '09d' },
        53: { desc: '毛毛雨', icon: '09d' },
        55: { desc: '大毛毛雨', icon: '09d' },
        56: { desc: '冻毛毛雨', icon: '09d' },
        57: { desc: '冻毛毛雨', icon: '09d' },
        61: { desc: '小雨', icon: '10d' },
        63: { desc: '中雨', icon: '10d' },
        65: { desc: '大雨', icon: '10d' },
        66: { desc: '冻雨', icon: '13d' },
        67: { desc: '冻雨', icon: '13d' },
        71: { desc: '小雪', icon: '13d' },
        73: { desc: '中雪', icon: '13d' },
        75: { desc: '大雪', icon: '13d' },
        77: { desc: '雪粒', icon: '13d' },
        80: { desc: '阵雨', icon: '09d' },
        81: { desc: '中阵雨', icon: '09d' },
        82: { desc: '大阵雨', icon: '09d' },
        85: { desc: '小阵雪', icon: '13d' },
        86: { desc: '大阵雪', icon: '13d' },
        95: { desc: '雷暴', icon: '11d' },
        96: { desc: '雷暴伴冰雹', icon: '11d' },
        99: { desc: '雷暴伴大冰雹', icon: '11d' }
      };

      const wmo = data.current.weather_code;
      const weather = wmoMap[wmo] || { desc: '未知', icon: '02d' };

      // 城市名称（Open-Meteo 不返回城市名，用坐标反查或显示已选城市）
      let cityName = this.selectedCity?.name || '';
      if (!cityName) {
        // 简单根据坐标范围判断
        if (Math.abs(lat - 39.9) < 1 && Math.abs(lon - 116.4) < 1) cityName = '北京';
        else if (Math.abs(lat - 31.2) < 1 && Math.abs(lon - 121.5) < 1) cityName = '上海';
        else if (Math.abs(lat - 23.1) < 1 && Math.abs(lon - 113.3) < 1) cityName = '广州';
        else if (Math.abs(lat - 22.5) < 1 && Math.abs(lon - 114.1) < 1) cityName = '深圳';
        else cityName = `${lat.toFixed(1)}, ${lon.toFixed(1)}`;
      }

      const current = {
        temp: Math.round(data.current.temperature_2m),
        feelsLike: Math.round(data.current.apparent_temperature),
        humidity: data.current.relative_humidity_2m,
        description: weather.desc,
        icon: weather.icon,
        windSpeed: Math.round(data.current.wind_speed_10m),
        windDir: data.current.wind_direction_10m,
        city: cityName
      };

      // 预报
      const forecast = [];
      if (data.daily) {
        for (let i = 1; i < data.daily.time.length; i++) {
          const wmoD = data.daily.weather_code[i];
          const wD = wmoMap[wmoD] || { desc: '未知', icon: '02d' };
          forecast.push({
            date: data.daily.time[i],
            tempMax: Math.round(data.daily.temperature_2m_max[i]),
            tempMin: Math.round(data.daily.temperature_2m_min[i]),
            text: wD.desc,
            icon: wD.icon
          });
        }
      }

      return { current, forecast };
    } catch (e) {
      console.warn('Open-Meteo fetch failed:', e);
      return {
        current: {
          temp: '--', feelsLike: '--', humidity: '--',
          description: '获取天气失败，请检查网络',
          icon: '02d', windSpeed: '--', city: '加载失败',
          error: e.message
        },
        forecast: []
      };
    }
  },

  /* ─── 搜索城市（Open-Meteo 地理编码，免费无需 Key） ──────────────────── */
  async _searchCity(name) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=zh`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Geocoding failed');
      const data = await resp.json();
      if (!data.results || data.results.length === 0) return null;
      return { lat: data.results[0].latitude, lon: data.results[0].longitude };
    } catch (e) {
      console.warn('City search failed:', e);
      return null;
    }
  },

  /* ─── OpenWeatherMap（需 API Key） ───────────────────────────────────── */
  async _fetchOpenWeather(lat, lon) {
    if (!this.apiKey) return this._noKeyResult();
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&lang=zh_cn`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Weather API error: ' + resp.status);
      const data = await resp.json();

      const current = {
        temp: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        windSpeed: data.wind.speed,
        windDir: data.wind.deg,
        clouds: data.clouds?.all || 0,
        visibility: data.visibility,
        city: data.name,
        sunrise: data.sys.sunrise,
        sunset: data.sys.sunset
      };

      const forecastResp = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&lang=zh_cn`
      );
      const forecastData = await forecastResp.json();
      const forecast = this._parseForecast(forecastData.list);

      return { current, forecast };
    } catch (e) {
      console.warn('OpenWeather fetch failed:', e);
      return { current: { temp: '--', description: '获取失败', icon: '02d', city: '错误', error: e.message }, forecast: [] };
    }
  },

  /* ─── 和风天气（需 API Key） ────────────────────────────────────────── */
  async _fetchHefeng(lat, lon) {
    if (!this.apiKey) return this._noKeyResult();
    try {
      const nowUrl = `https://devapi.qweather.com/v7/weather/now?location=${lon},${lat}&key=${this.apiKey}`;
      const nowResp = await fetch(nowUrl);
      if (!nowResp.ok) throw new Error('Hefeng API error');
      const nowData = await nowResp.json();

      const current = {
        temp: parseInt(nowData.now.temp),
        feelsLike: parseInt(nowData.now.feelsLike),
        humidity: parseInt(nowData.now.humidity),
        pressure: parseInt(nowData.now.pressure),
        description: nowData.now.text,
        icon: nowData.now.icon,
        windSpeed: parseInt(nowData.now.windSpeed),
        windDir: nowData.now.windDir,
        visibility: nowData.now.visibility,
        city: nowData.resolvedLocation || ''
      };

      const fcUrl = `https://devapi.qweather.com/v7/weather/3d?location=${lon},${lat}&key=${this.apiKey}`;
      const fcResp = await fetch(fcUrl);
      const fcData = await fcResp.json();
      const forecast = (fcData.daily || []).map(d => ({
        date: d.fxDate,
        tempMax: parseInt(d.tempMax),
        tempMin: parseInt(d.tempMin),
        text: d.textDay,
        icon: d.iconDay,
        windSpeed: parseInt(d.windSpeedDay)
      }));

      return { current, forecast };
    } catch (e) {
      console.warn('Hefeng fetch failed:', e);
      return { current: { temp: '--', description: '获取失败', icon: '02d', city: '错误', error: e.message }, forecast: [] };
    }
  },

  /* ─── 无 Key 时的提示结果 ────────────────────────────────────────────── */
  _noKeyResult() {
    return {
      current: {
        temp: '--', feelsLike: '--', humidity: '--',
        description: '请切换到「Open-Meteo（免Key）」或配置 API Key',
        icon: '01d', windSpeed: '--', city: '需要配置',
        noKey: true
      },
      forecast: []
    };
  },

  /* ─── 解析预报数据 ───────────────────────────────────────────────────── */
  _parseForecast(list) {
    const daily = {};
    for (const item of list) {
      const date = item.dt_txt.slice(0, 10);
      if (!daily[date]) {
        daily[date] = { date, tempMax: item.main.temp_max, tempMin: item.main.temp_min, texts: [], icons: [] };
      }
      daily[date].tempMax = Math.max(daily[date].tempMax, item.main.temp_max);
      daily[date].tempMin = Math.min(daily[date].tempMin, item.main.temp_min);
      daily[date].texts.push(item.weather[0].description);
      daily[date].icons.push(item.weather[0].icon);
    }
    return Object.values(daily).slice(0, 5).map(d => ({
      date: d.date,
      tempMax: Math.round(d.tempMax),
      tempMin: Math.round(d.tempMin),
      text: d.texts[Math.floor(d.texts.length / 2)],
      icon: d.icons[Math.floor(d.icons.length / 2)]
    }));
  },

  /* ─── 常用城市列表 ───────────────────────────────────────────────────── */
  getCommonCities() {
    return [
      { name: '北京', lat: 39.9, lon: 116.4 },
      { name: '上海', lat: 31.2, lon: 121.5 },
      { name: '广州', lat: 23.1, lon: 113.3 },
      { name: '深圳', lat: 22.5, lon: 114.1 },
      { name: '杭州', lat: 30.3, lon: 120.2 },
      { name: '成都', lat: 30.6, lon: 104.1 },
      { name: '武汉', lat: 30.6, lon: 114.3 },
      { name: '南京', lat: 32.1, lon: 118.8 },
      { name: '重庆', lat: 29.6, lon: 106.5 },
      { name: '西安', lat: 34.3, lon: 108.9 },
      { name: '长沙', lat: 28.2, lon: 112.9 },
      { name: '青岛', lat: 36.1, lon: 120.4 },
      { name: '大连', lat: 38.9, lon: 121.6 },
      { name: '厦门', lat: 24.5, lon: 118.1 },
      { name: '昆明', lat: 25.0, lon: 102.7 },
    ];
  },

  /* ─── 天气图标映射 ───────────────────────────────────────────────────── */
  getWeatherEmoji(iconCode) {
    const map = {
      '01d': '☀️', '01n': '🌙',
      '02d': '⛅', '02n': '☁️',
      '03d': '☁️', '03n': '☁️',
      '04d': '☁️', '04n': '☁️',
      '09d': '🌦️', '09n': '🌧️',
      '10d': '🌧️', '10n': '🌧️',
      '11d': '⛈️', '11n': '⛈️',
      '13d': '🌨️', '13n': '❄️',
      '50d': '🌫️', '50n': '🌫️'
    };
    return map[iconCode] || '🌤️';
  },

  /* ─── 获取 UI 建议 ───────────────────────────────────────────────────── */
  getSuggestion(weather) {
    if (!weather || weather.noKey || weather.error) return [];
    const tips = [];
    const t = weather.temp;
    const desc = weather.description || '';

    if (t > 35) tips.push({ icon: '🥵', text: '高温预警，注意防暑' });
    else if (t > 30) tips.push({ icon: '😅', text: '天气炎热，多喝水' });
    else if (t < 0) tips.push({ icon: '🥶', text: '严寒天气，注意保暖' });
    else if (t < 10) tips.push({ icon: '🧥', text: '气温较低，建议加衣' });
    else if (t >= 20 && t <= 25) tips.push({ icon: '🌿', text: '天气宜人，适合户外' });

    if (desc.includes('雨')) tips.push({ icon: '☂️', text: '有雨，记得带伞' });
    if (desc.includes('雪')) tips.push({ icon: '🧣', text: '下雪天，注意路滑' });
    if (weather.windSpeed > 5) tips.push({ icon: '💨', text: '风力较大，注意防风' });
    if (weather.humidity > 80) tips.push({ icon: '💧', text: '湿度很高，可能下雨' });
    if (weather.humidity < 30) tips.push({ icon: '🏜️', text: '空气干燥，多补水' });
    if (weather.visibility && weather.visibility < 1000) tips.push({ icon: '🌫️', text: '能见度低，注意安全' });

    return tips;
  }
};

window.WeatherSystem = WeatherSystem;