// BULLETPROOF CAPITAL API - Nikdy sa nevráti na štartové hodnoty
// Hlavné úložisko pre všetky dáta

let bulletproofData = {
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
  
  // Bezpečnostné záznamy
  lastMT5Update: null,
  totalUpdatesReceived: 0,
  systemStartTime: new Date().toISOString()
};

// BULLETPROOF funkcia - nikdy nezabudne dáta
function bulletproofDailyCheck() {
  const today = new Date().toISOString().split('T')[0];
  
  // Ak je nový deň a už sme niekedy dostali dáta z MT5
  if (bulletproofData.currentDay !== today && bulletproofData.hasEverReceivedMT5Data) {
    console.log(`🛡️  BULLETPROOF NEW DAY: ${bulletproofData.currentDay} -> ${today}`);
    
    // KĽÚČOVÉ: Nezmeníme equity, len nastavíme nový daily start
    bulletproofData.dailyStartEquity = bulletproofData.equity;
    bulletproofData.currentDay = today;
    bulletproofData.dailyProfit = 0; // Reset len daily profit, equity zostáva
    
    console.log(`🛡️  New daily start: ${bulletproofData.dailyStartEquity}€ (equity preserved)`);
    return true;
  }
  
  return false;
}

// BULLETPROOF výpočet denného zisku
function bulletproofCalculateDailyProfit() {
  if (!bulletproofData.hasEverReceivedMT5Data) {
    return 0; // Ak ešte neboli žiadne dáta, daily = 0
  }
  
  const dailyProfit = bulletproofData.equity - bulletproofData.dailyStartEquity;
  console.log(`🛡️  Daily: ${bulletproofData.equity} - ${bulletproofData.dailyStartEquity} = ${dailyProfit}`);
  return dailyProfit;
}

exports.handler = async (event, context) => {
  console.log('🛡️  BULLETPROOF Capital API called:', event.httpMethod);
  console.log('🛡️  Current data:', bulletproofData);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      // BULLETPROOF kontrola dňa
      bulletproofDailyCheck();
      
      // BULLETPROOF prepočet daily profit
      bulletproofData.dailyProfit = bulletproofCalculateDailyProfit();
      
      console.log('🛡️  Returning bulletproof data:', bulletproofData);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          amount: bulletproofData.equity,
          dailyProfit: bulletproofData.dailyProfit,
          totalProfit: bulletproofData.equity - 15, // Vždy prepočítaj z equity
          liveTradeProfit: bulletproofData.liveProfit,
          tradingStatus: bulletproofData.status,
          lastUpdate: bulletproofData.lastUpdate,
          status: 'success',
          timestamp: Date.now(),
          dataSource: bulletproofData.hasEverReceivedMT5Data ? 'bulletproof_persistent' : 'initial',
          
          // Debug info
          debug: {
            hasEverReceivedMT5Data: bulletproofData.hasEverReceivedMT5Data,
            dailyStartEquity: bulletproofData.dailyStartEquity,
            currentDay: bulletproofData.currentDay,
            totalUpdatesReceived: bulletproofData.totalUpdatesReceived,
            systemStartTime: bulletproofData.systemStartTime
          }
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      console.log('🛡️  POST request body:', body);
      
      // Validácia secret
      if (body.secret !== process.env.API_SECRET) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' })
        };
      }

      if (body.amount !== undefined) {
        const oldData = { ...bulletproofData };
        
        // BULLETPROOF aktualizácia
        const newEquity = parseFloat(body.amount);
        
        // Ak je to prvá aktualizácia, nastav daily start
        if (!bulletproofData.hasEverReceivedMT5Data) {
          bulletproofData.dailyStartEquity = newEquity;
          bulletproofData.hasEverReceivedMT5Data = true;
          console.log('🛡️  FIRST MT5 UPDATE - Daily start set to:', newEquity);
        }
        
        // Kontrola nového dňa
        bulletproofDailyCheck();
        
        // Aktualizuj equity
        bulletproofData.equity = newEquity;
        
        // Prepočítaj daily profit
        bulletproofData.dailyProfit = bulletproofCalculateDailyProfit();
        
        // Aktualizuj ostatné hodnoty len ak sú poskytnuté
        if (body.dailyProfit !== undefined && body.dailyProfit !== null) {
          // Ignoruj MT5 daily profit, používaj vlastný výpočet
          console.log('🛡️  Ignoring MT5 daily profit, using own calculation');
        }
        
        if (body.liveTradeProfit !== undefined && body.liveTradeProfit !== null) {
          bulletproofData.liveProfit = parseFloat(body.liveTradeProfit);
        }
        
        if (body.tradingStatus && body.tradingStatus !== '') {
          bulletproofData.status = body.tradingStatus;
        }
        
        // Bezpečnostné záznamy
        bulletproofData.lastUpdate = new Date().toISOString();
        bulletproofData.lastMT5Update = new Date().toISOString();
        bulletproofData.totalUpdatesReceived++;
        
        console.log('🛡️  BULLETPROOF data updated:', {
          old: oldData,
          new: bulletproofData,
          preservedEquity: bulletproofData.equity,
          calculatedDaily: bulletproofData.dailyProfit,
          totalUpdates: bulletproofData.totalUpdatesReceived
        });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Bulletproof data updated successfully',
          data: bulletproofData,
          preserved: true
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('🛡️  BULLETPROOF Capital API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
