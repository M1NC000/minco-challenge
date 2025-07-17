// AUTOMATIC CAPITAL API - Spolupracuje s automatickým MT5 systémom
let capitalData = {
  amount: 15.00,
  dailyProfit: 0,
  totalProfit: 0,
  liveTradeProfit: 0,
  tradingStatus: 'No positions',
  lastUpdate: new Date().toISOString(),
  hasReceivedMT5Data: false,
  currentDay: new Date().toISOString().split('T')[0],
  dailyStartAmount: 15.00,
  isAutomatic: true // Flag pre automatický systém
};

// Automatická kontrola nového dňa
function autoCheckNewDay() {
  const today = new Date().toISOString().split('T')[0];
  
  if (capitalData.currentDay !== today) {
    console.log(`🌅 AUTOMATIC NEW DAY: ${capitalData.currentDay} -> ${today}`);
    
    // Automaticky aktualizuj štartovú sumu
    capitalData.dailyStartAmount = capitalData.amount;
    capitalData.currentDay = today;
    capitalData.dailyProfit = 0;
    
    console.log(`📊 Automatic daily start: ${capitalData.dailyStartAmount}€`);
    
    return true;
  }
  
  return false;
}

// Automatický prepočet denného zisku
function autoCalculateDailyProfit() {
  const dailyProfit = capitalData.amount - capitalData.dailyStartAmount;
  console.log(`🧮 Auto daily calculation: ${capitalData.amount} - ${capitalData.dailyStartAmount} = ${dailyProfit}`);
  return dailyProfit;
}

// Hlavná funkcia pre API endpoint
exports.handler = async (event, context) => {
  console.log('Automatic Capital API called:', event.httpMethod, 'Current data:', capitalData);
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      // Automaticky skontroluj nový deň pred vrátením dát
      autoCheckNewDay();
      
      // Automaticky prepočítaj denný zisk
      capitalData.dailyProfit = autoCalculateDailyProfit();
      
      console.log('Returning automatic capital data:', capitalData);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...capitalData,
          status: 'success',
          timestamp: Date.now(),
          dataSource: capitalData.hasReceivedMT5Data ? 'automatic_persistent' : 'initial',
          systemType: 'automatic'
        })
      };
    }

    if (event.httpMethod === 'POST') {
      // Aktualizovať dáta (z live-sync alebo iných zdrojov)
      const body = JSON.parse(event.body || '{}');
      console.log('POST request body:', body);
      
      // Validácia secret kľúča
      if (body.secret !== process.env.API_SECRET) {
        console.log('Unauthorized access attempt');
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' })
        };
      }

      // ANTI-SPAM ochrana - ignoruj requesty príliš blízko k sebe (menej ako 3 sekundy)
      const now = Date.now();
      const timeSinceLastUpdate = now - capitalData.lastUpdateTimestamp;
      
      if (timeSinceLastUpdate < 3000) { // Menej ako 3 sekundy
        console.log(`Request ignored - too soon after last update (${timeSinceLastUpdate}ms)`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: 'Update ignored - too frequent',
            data: capitalData,
            timeSinceLastUpdate: timeSinceLastUpdate
          })
        };
      }

      // Aktualizovať kapitál a live trade údaje
      if (body.amount !== undefined) {
        const oldData = { ...capitalData };
        
        // Skontroluj nový deň pred aktualizáciou
        const isNewDay = checkNewDay();
        
        // EQUITY (vždy aktualizuj)
        const newEquity = parseFloat(body.amount);
        capitalData.amount = newEquity;
        
        // DENNÝ ZISK - automaticky prepočítaj na základe daily start amount
        capitalData.dailyProfit = calculateDailyProfit();
        
        // CELKOVÝ ZISK (vždy prepočítaj)
        capitalData.totalProfit = capitalData.amount - 15; // 15€ je štartovacia suma
        
        // LIVE TRADE PROFIT - aktualizuj iba ak je zmena
        if (body.liveTradeProfit !== undefined && body.liveTradeProfit !== null) {
          const newLiveProfit = parseFloat(body.liveTradeProfit);
          if (newLiveProfit !== capitalData.liveTradeProfit) {
            capitalData.liveTradeProfit = newLiveProfit;
            console.log(`Live trade profit updated: ${capitalData.liveTradeProfit} -> ${newLiveProfit}`);
          }
        }
        
        // TRADING STATUS - aktualizuj iba ak je zmena
        if (body.tradingStatus !== undefined && body.tradingStatus !== null && body.tradingStatus !== '') {
          if (body.tradingStatus !== capitalData.tradingStatus) {
            capitalData.tradingStatus = body.tradingStatus;
            console.log(`Trading status updated: ${capitalData.tradingStatus} -> ${body.tradingStatus}`);
          }
        }
        
        // Aktualizuj timestampy
        capitalData.lastUpdate = new Date().toISOString();
        capitalData.lastUpdateTimestamp = now;
        capitalData.hasReceivedMT5Data = true;
        
        console.log('Capital data updated:', { 
          old: oldData, 
          new: capitalData,
          isNewDay: isNewDay,
          dailyStartAmount: capitalData.dailyStartAmount,
          calculatedDailyProfit: capitalData.dailyProfit
        });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Automatic capital updated successfully',
          data: capitalData,
          systemType: 'automatic'
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Automatic Capital API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
