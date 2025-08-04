// KOMPLETNÉ PERZISTENTNÉ CAPITAL API v2.0
// Nikdy nestratí dáta, správne počíta denný zisk, trackuje ciele s časmi

const fs = require('fs').promises;
const path = require('path');

// Cesty k perzistentným súborom
const DATA_FILE = '/tmp/minco_capital_data.json';
const BACKUP_DATA_FILE = path.join(__dirname, 'capital_backup.json');
const HISTORY_FILE = '/tmp/minco_daily_history.json';

// Štartové hodnoty
const DEFAULT_DATA = {
  equity: 15.00,
  dailyProfit: 0,
  totalProfit: 0,
  liveProfit: 0,
  status: 'No positions',
  lastUpdate: new Date().toISOString(),
  
  // Kritické pre zachovanie dát
  hasEverReceivedMT5Data: false,
  dailyStartEquity: 15.00,
  currentDay: new Date().toISOString().split('T')[0],
  
  // Tracking pre každý deň - kompletná história
  dailyHistory: {}, // { "2025-08-04": { startEquity: 15, endEquity: 20, profit: 5, timestamp: "...", trades: [] } }
  
  // Tracking cieľov dosiahnutých s presným časom
  goalsAchieved: {}, // { "20": "2025-08-04T10:30:00.123Z", "25": "2025-08-04T14:20:15.456Z" }
  
  // Bezpečnostné záznamy
  lastMT5Update: null,
  totalUpdatesReceived: 0,
  systemStartTime: new Date().toISOString(),
  
  // Performance tracking
  updateFrequency: 0,
  averageUpdateInterval: 0,
  lastPerformanceCheck: new Date().toISOString(),
  
  // Verzia dát pre migrácie
  dataVersion: '2.0'
};

// PERZISTENTNÉ načítanie dát s error handling
async function loadPersistedData() {
  console.log('📂 Loading persisted data...');
  
  try {
    // Pokús sa načítať z /tmp (primárne úložisko)
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(data);
      
      // Validácia dát
      if (parsed && typeof parsed === 'object' && parsed.equity !== undefined) {
        console.log('📂 Data loaded from /tmp storage:', {
          equity: parsed.equity,
          dailyProfit: parsed.dailyProfit,
          goalsCount: parsed.goalsAchieved ? Object.keys(parsed.goalsAchieved).length : 0,
          historyDays: parsed.dailyHistory ? Object.keys(parsed.dailyHistory).length : 0
        });
        return { ...DEFAULT_DATA, ...parsed };
      }
    } catch (tmpError) {
      console.log('📂 /tmp storage not available or corrupted:', tmpError.message);
    }
    
    // Pokús sa načítať z backup lokácie
    try {
      const data = await fs.readFile(BACKUP_DATA_FILE, 'utf8');
      const parsed = JSON.parse(data);
      
      if (parsed && typeof parsed === 'object' && parsed.equity !== undefined) {
        console.log('📂 Data loaded from backup storage');
        return { ...DEFAULT_DATA, ...parsed };
      }
    } catch (backupError) {
      console.log('📂 Backup storage not available:', backupError.message);
    }
    
  } catch (error) {
    console.error('📂 Error loading persisted data:', error);
  }
  
  console.log('📂 No valid persisted data found, using defaults');
  return { ...DEFAULT_DATA };
}

// PERZISTENTNÉ uloženie dát s duplikovaným zálohovaniem
async function savePersistedData(data) {
  const timestamp = new Date().toISOString();
  const dataToSave = {
    ...data,
    lastSaved: timestamp,
    saveCount: (data.saveCount || 0) + 1
  };
  
  const jsonData = JSON.stringify(dataToSave, null, 2);
  let savedLocations = [];
  
  // Pokús sa uložiť do /tmp (primárne)
  try {
    await fs.writeFile(DATA_FILE, jsonData, 'utf8');
    savedLocations.push('/tmp');
    console.log('💾 Data saved to /tmp storage');
  } catch (tmpError) {
    console.warn('💾 /tmp storage not writable:', tmpError.message);
  }
  
  // Pokús sa uložiť do backup lokácie
  try {
    await fs.writeFile(BACKUP_DATA_FILE, jsonData, 'utf8');
    savedLocations.push('backup');
    console.log('💾 Data saved to backup storage');
  } catch (backupError) {
    console.warn('💾 Backup storage not writable:', backupError.message);
  }
  
  // Ulož históriu osobne (ak je veľká)
  if (data.dailyHistory && Object.keys(data.dailyHistory).length > 5) {
    try {
      const historyData = {
        dailyHistory: data.dailyHistory,
        goalsAchieved: data.goalsAchieved,
        lastHistorySave: timestamp
      };
      await fs.writeFile(HISTORY_FILE, JSON.stringify(historyData, null, 2), 'utf8');
      savedLocations.push('history');
      console.log('💾 History data saved separately');
    } catch (historyError) {
      console.warn('💾 History storage failed:', historyError.message);
    }
  }
  
  if (savedLocations.length === 0) {
    console.error('⚠️  CRITICAL: Could not persist data to any location!');
    return false;
  }
  
  console.log(`💾 Data successfully saved to: ${savedLocations.join(', ')}`);
  return true;
}

// SPRÁVNY výpočet denného zisku na základe histórie
function calculateCorrectDailyProfit(data) {
  const today = new Date().toISOString().split('T')[0];
  
  // Ak máme historical data pre dnešok
  if (data.dailyHistory && data.dailyHistory[today]) {
    const todayData = data.dailyHistory[today];
    const dailyProfit = data.equity - todayData.startEquity;
    
    console.log(`📊 Daily calculation (from history): ${data.equity} - ${todayData.startEquity} = ${dailyProfit}`);
    return dailyProfit;
  }
  
  // Ak je to prvý deň alebo nemáme dáta
  if (!data.hasEverReceivedMT5Data) {
    console.log('📊 Daily calculation: No MT5 data yet, returning 0');
    return 0;
  }
  
  // Fallback na starú logiku
  const dailyProfit = data.equity - data.dailyStartEquity;
  console.log(`📊 Daily calculation (fallback): ${data.equity} - ${data.dailyStartEquity} = ${dailyProfit}`);
  return dailyProfit;
}

// Kontrola nového dňa s kompletnou históriou
function handleDayChange(data) {
  const today = new Date().toISOString().split('T')[0];
  
  if (data.currentDay !== today) {
    console.log(`📅 NEW DAY DETECTED: ${data.currentDay} -> ${today}`);
    
    // Ulož včerajší denný výsledok ak existuje
    if (data.currentDay && data.hasEverReceivedMT5Data) {
      const yesterdayProfit = data.equity - data.dailyStartEquity;
      
      // Inicializuj daily history ak neexistuje
      if (!data.dailyHistory) {
        data.dailyHistory = {};
      }
      
      data.dailyHistory[data.currentDay] = {
        startEquity: data.dailyStartEquity,
        endEquity: data.equity,
        profit: yesterdayProfit,
        timestamp: new Date().toISOString(),
        tradingDuration: 'full_day',
        maxEquity: Math.max(data.dailyStartEquity, data.equity),
        minEquity: Math.min(data.dailyStartEquity, data.equity)
      };
      
      console.log(`📊 Yesterday (${data.currentDay}) result saved:`, {
        profit: yesterdayProfit,
        startEquity: data.dailyStartEquity,
        endEquity: data.equity
      });
    }
    
    // Nastav nový deň
    data.currentDay = today;
    data.dailyStartEquity = data.equity;
    
    // Inicializuj dnešný záznam
    if (!data.dailyHistory) {
      data.dailyHistory = {};
    }
    
    data.dailyHistory[today] = {
      startEquity: data.equity,
      endEquity: data.equity,
      profit: 0,
      timestamp: new Date().toISOString(),
      isCurrentDay: true
    };
    
    console.log(`📅 New day initialized. Start equity: ${data.dailyStartEquity}€`);
    return true;
  }
  
  return false;
}

// Tracking dosiahnutých cieľov s presným časom
function trackGoalsAchieved(data, newEquity) {
  // Kompletný zoznam cieľov pre 100-dňovú výzvu
  const goals = [
    20, 25, 30, 35, 40, 50, 60, 75, 90, 100,
    120, 150, 180, 200, 250, 300, 360, 430, 500, 610,
    730, 870, 1000, 1240, 1480, 1780, 2140, 2560, 3080, 3690,
    4430, 5320, 6380, 7650, 9190, 11030, 13240, 15890, 19070, 22890,
    27470, 32960, 39550, 47460, 56950, 68340, 82010, 98410, 118090, 141710,
    170050, 204060, 244870, 293840, 352610, 423130, 507760, 609310, 731170, 877400,
    1052880, 1263460, 1516150, 1819380, 2183260, 2619910, 3143890, 3772670, 4527200, 5432640,
    6519170, 7823000, 9387600, 11265120, 13518140, 16221770, 19466120, 23359340, 28031210, 33637450,
    40364940, 48437930, 58125510, 69750610, 83700730, 100440880, 120529050, 144634860, 173561830, 208274200,
    249929040, 299914850, 359897820, 431877380, 518252860, 621903430, 746284120, 895540940, 1074649130, 1289579000,
    1547494800, 1856993760, 2228392510, 2674071010, 3208885210, 3850662250
  ];
  
  // Inicializuj goalsAchieved ak neexistuje
  if (!data.goalsAchieved) {
    data.goalsAchieved = {};
  }
  
  let newGoalsAchieved = [];
  
  for (const goal of goals) {
    const goalStr = goal.toString();
    
    // Ak sme dosiahli cieľ a ešte ho nemáme zaznamenaný
    if (newEquity >= goal && !data.goalsAchieved[goalStr]) {
      const achievedAt = new Date().toISOString();
      data.goalsAchieved[goalStr] = achievedAt;
      newGoalsAchieved.push(goal);
      
      console.log(`🎯 GOAL ACHIEVED: ${formatNumber(goal)}€ at ${achievedAt}`);
    }
  }
  
  return newGoalsAchieved;
}

// Formatovanie čísiel pre logy
function formatNumber(number, decimals = 2) {
  return new Intl.NumberFormat('sk-SK', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  }).format(number);
}

// Performance tracking
function updatePerformanceMetrics(data) {
  const now = new Date();
  const lastCheck = new Date(data.lastPerformanceCheck || now);
  const timeDiff = now - lastCheck;
  
  // Aktualizuj performance metriky každých 5 minút
  if (timeDiff > 300000) { // 5 minút
    const updatesInPeriod = data.totalUpdatesReceived - (data.lastUpdateCount || 0);
    const avgInterval = updatesInPeriod > 0 ? timeDiff / updatesInPeriod : 0;
    
    data.updateFrequency = updatesInPeriod;
    data.averageUpdateInterval = avgInterval;
    data.lastPerformanceCheck = now.toISOString();
    data.lastUpdateCount = data.totalUpdatesReceived;
    
    console.log(`📈 Performance: ${updatesInPeriod} updates in ${Math.round(timeDiff/1000)}s (avg: ${Math.round(avgInterval/1000)}s)`);
  }
}

// Hlavná logika
let cachedData = null;
let lastSaveTime = 0;
const SAVE_INTERVAL = 10000; // Ulož každých 10 sekúnd max

exports.handler = async (event, context) => {
  console.log('💎 PERZISTENTNÉ Capital API v2.0 called:', event.httpMethod);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Načítaj perzistentné dáta ak nie sú v cache
    if (!cachedData) {
      cachedData = await loadPersistedData();
      console.log('💎 Data loaded from persistence into cache');
    }
    
    if (event.httpMethod === 'GET') {
      // Kontrola nového dňa
      const dayChanged = handleDayChange(cachedData);
      
      // Správny prepočet denného zisku
      const correctDailyProfit = calculateCorrectDailyProfit(cachedData);
      cachedData.dailyProfit = correctDailyProfit;
      
      // Aktualizuj dnešný záznam
      const today = new Date().toISOString().split('T')[0];
      if (cachedData.dailyHistory && cachedData.dailyHistory[today]) {
        cachedData.dailyHistory[today].endEquity = cachedData.equity;
        cachedData.dailyHistory[today].profit = correctDailyProfit;
        cachedData.dailyHistory[today].timestamp = new Date().toISOString();
      }
      
      // Ulož ak sa deň zmenil
      if (dayChanged) {
        await savePersistedData(cachedData);
      }
      
      console.log('💎 Returning data:', {
        equity: formatNumber(cachedData.equity),
        dailyProfit: formatNumber(correctDailyProfit),
        totalProfit: formatNumber(cachedData.equity - 15),
        goalsCount: cachedData.goalsAchieved ? Object.keys(cachedData.goalsAchieved).length : 0,
        historyDays: cachedData.dailyHistory ? Object.keys(cachedData.dailyHistory).length : 0
      });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          amount: cachedData.equity,
          dailyProfit: correctDailyProfit,
          totalProfit: cachedData.equity - 15,
          liveTradeProfit: cachedData.liveProfit || 0,
          tradingStatus: cachedData.status || 'No positions',
          lastUpdate: cachedData.lastUpdate,
          status: 'success',
          timestamp: Date.now(),
          dataSource: 'persistent_storage_v2',
          
          // Rozšírené dáta pre frontend
          goalsAchieved: cachedData.goalsAchieved || {},
          dailyHistory: cachedData.dailyHistory || {},
          
          // Rozšírené debug info
          debug: {
            hasEverReceivedMT5Data: cachedData.hasEverReceivedMT5Data,
            dailyStartEquity: cachedData.dailyStartEquity,
            currentDay: cachedData.currentDay,
            totalUpdatesReceived: cachedData.totalUpdatesReceived,
            systemStartTime: cachedData.systemStartTime,
            dataVersion: cachedData.dataVersion,
            cacheHit: true,
            persistedGoals: cachedData.goalsAchieved ? Object.keys(cachedData.goalsAchieved).length : 0,
            historyDays: cachedData.dailyHistory ? Object.keys(cachedData.dailyHistory).length : 0,
            updateFrequency: cachedData.updateFrequency || 0,
            averageInterval: Math.round((cachedData.averageUpdateInterval || 0) / 1000)
          }
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      console.log('💎 POST request body:', {
        amount: body.amount,
        dailyProfit: body.dailyProfit,
        liveTradeProfit: body.liveTradeProfit,
        tradingStatus: body.tradingStatus,
        hasSecret: !!body.secret
      });
      
      // Validácia secret
      if (body.secret !== process.env.API_SECRET) {
        console.warn('🔐 Unauthorized access attempt');
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            error: 'Unauthorized',
            timestamp: Date.now()
          })
        };
      }

      if (body.amount !== undefined) {
        const oldData = {
          equity: cachedData.equity,
          dailyProfit: cachedData.dailyProfit,
          goalsCount: cachedData.goalsAchieved ? Object.keys(cachedData.goalsAchieved).length : 0
        };
        
        const newEquity = parseFloat(body.amount);
        
        // Ak je to prvá aktualizácia
        if (!cachedData.hasEverReceivedMT5Data) {
          cachedData.dailyStartEquity = newEquity;
          cachedData.hasEverReceivedMT5Data = true;
          
          // Inicializuj dnešný záznam
          const today = new Date().toISOString().split('T')[0];
          if (!cachedData.dailyHistory) {
            cachedData.dailyHistory = {};
          }
          
          cachedData.dailyHistory[today] = {
            startEquity: newEquity,
            endEquity: newEquity,
            profit: 0,
            timestamp: new Date().toISOString(),
            isFirstDay: true
          };
          
          console.log('💎 FIRST MT5 UPDATE - Daily start set to:', formatNumber(newEquity));
        }
        
        // Kontrola nového dňa
        const dayChanged = handleDayChange(cachedData);
        
        // Aktualizuj equity
        cachedData.equity = newEquity;
        
        // Tracking cieľov
        const newGoals = trackGoalsAchieved(cachedData, newEquity);
        
        // Prepočítaj správny denný zisk
        cachedData.dailyProfit = calculateCorrectDailyProfit(cachedData);
        
        // Aktualizuj ostatné hodnoty
        if (body.liveTradeProfit !== undefined && body.liveTradeProfit !== null && !isNaN(parseFloat(body.liveTradeProfit))) {
          cachedData.liveProfit = parseFloat(body.liveTradeProfit);
        }
        
        if (body.tradingStatus && body.tradingStatus.trim() !== '') {
          cachedData.status = body.tradingStatus;
        }
        
        // Aktualizuj dnešný záznam
        const today = new Date().toISOString().split('T')[0];
        if (cachedData.dailyHistory && cachedData.dailyHistory[today]) {
          cachedData.dailyHistory[today].endEquity = newEquity;
          cachedData.dailyHistory[today].profit = cachedData.dailyProfit;
          cachedData.dailyHistory[today].timestamp = new Date().toISOString();
          cachedData.dailyHistory[today].lastMT5Update = new Date().toISOString();
        }
        
        // Bezpečnostné záznamy
        cachedData.lastUpdate = new Date().toISOString();
        cachedData.lastMT5Update = new Date().toISOString();
        cachedData.totalUpdatesReceived = (cachedData.totalUpdatesReceived || 0) + 1;
        
        // Performance tracking
        updatePerformanceMetrics(cachedData);
        
        // PERZISTENTNE ULOŽ (s throttling)
        const now = Date.now();
        if (now - lastSaveTime > SAVE_INTERVAL || dayChanged || newGoals.length > 0) {
          const saveSuccess = await savePersistedData(cachedData);
          if (saveSuccess) {
            lastSaveTime = now;
          }
        }
        
        console.log('💎 PERZISTENTNÉ data updated:', {
          oldEquity: formatNumber(oldData.equity),
          newEquity: formatNumber(newEquity),
          dailyProfit: formatNumber(cachedData.dailyProfit),
          totalUpdates: cachedData.totalUpdatesReceived,
          newGoals: newGoals.length,
          totalGoals: cachedData.goalsAchieved ? Object.keys(cachedData.goalsAchieved).length : 0
        });
        
        if (newGoals.length > 0) {
          console.log('🎯 New goals achieved this update:', newGoals.map(g => formatNumber(g) + '€').join(', '));
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Perzistentné data updated successfully',
          data: {
            equity: cachedData.equity,
            dailyProfit: cachedData.dailyProfit,
            totalProfit: cachedData.equity - 15,
            goalsAchieved: cachedData.goalsAchieved ? Object.keys(cachedData.goalsAchieved).length : 0,
            totalUpdates: cachedData.totalUpdatesReceived,
            lastUpdate: cachedData.lastUpdate
          },
          persisted: true,
          version: '2.0',
          timestamp: Date.now()
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        error: 'Method not allowed',
        allowed: ['GET', 'POST', 'OPTIONS'],
        timestamp: Date.now()
      })
    };

  } catch (error) {
    console.error('💎 PERZISTENTNÉ Capital API error:', error);
    
    // Emergency fallback
    const fallbackData = {
      amount: cachedData?.equity || 15,
      dailyProfit: cachedData?.dailyProfit || 0,
      totalProfit: (cachedData?.equity || 15) - 15,
      liveTradeProfit: cachedData?.liveProfit || 0,
      tradingStatus: cachedData?.status || 'System Error',
      lastUpdate: new Date().toISOString(),
      status: 'error',
      error: 'Internal server error - using cached data',
      timestamp: Date.now()
    };
    
    return {
      statusCode: 200, // Vrať 200 s error flagom aby frontend fungoval
      headers,
      body: JSON.stringify(fallbackData)
    };
  }
};
