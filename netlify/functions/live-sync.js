// AUTOMATIC live-sync API - Priamo z automatického MT5 systému
// Pamätá si posledné hodnoty aj po vypnutí MT5

let automaticData = {
  equity: 15.00,
  dailyProfit: 0,
  totalProfit: 0,
  liveProfit: 0,
  status: 'No positions',
  lastUpdate: new Date().toISOString(),
  hasReceivedData: false,
  lastUpdateTimestamp: 0,
  isLive: false // Indikuje či sú dáta live z MT5
};

exports.handler = async (event, context) => {
  console.log('🚀 AUTOMATIC Live-sync called:', event.httpMethod, new Date().toISOString());
  
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
      // Vráti aktuálne automatické dáta
      console.log('📊 Returning automatic data:', automaticData);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          amount: automaticData.equity,
          dailyProfit: automaticData.dailyProfit,
          totalProfit: automaticData.totalProfit,
          liveTradeProfit: automaticData.liveProfit,
          tradingStatus: automaticData.status,
          lastUpdate: automaticData.lastUpdate,
          isLive: automaticData.isLive,
          status: 'success',
          timestamp: Date.now(),
          dataSource: automaticData.hasReceivedData ? 'mt5_automatic' : 'initial'
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      console.log('📥 Received automatic data from MT5:', body);
      
      // Validácia dát z automatického MT5
      if (body.equity === undefined) {
        console.log('❌ Missing equity data');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing equity data' })
        };
      }

      const now = Date.now();
      const oldData = { ...automaticData };
      
      // Automatic anti-spam - kratší interval pre real-time (2 sekundy)
      if (automaticData.hasReceivedData && (now - automaticData.lastUpdateTimestamp) < 2000) {
        console.log('⚠️ Automatic update too frequent, ignoring');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            message: 'Automatic update ignored - too frequent',
            data: automaticData
          })
        };
      }

      // Aktualizuj automatické dáta
      automaticData.equity = parseFloat(body.equity);
      automaticData.dailyProfit = parseFloat(body.dailyProfit) || 0;
      automaticData.totalProfit = parseFloat(body.totalProfit) || (automaticData.equity - 15);
      automaticData.liveProfit = parseFloat(body.liveProfit) || 0;
      automaticData.status = body.status || 'No positions';
      automaticData.lastUpdate = new Date().toISOString();
      automaticData.lastUpdateTimestamp = now;
      automaticData.hasReceivedData = true;
      automaticData.isLive = true;

      // Nastavenie live timeout - ak nepríde update do 30 sekúnd, nie je live
      setTimeout(() => {
        if ((Date.now() - automaticData.lastUpdateTimestamp) > 30000) {
          automaticData.isLive = false;
          console.log('⚠️ MT5 connection appears offline');
        }
      }, 30000);

      console.log('✅ Automatic data updated:', {
        old: oldData,
        new: automaticData,
        changes: {
          equity: Math.abs(automaticData.equity - oldData.equity),
          daily: Math.abs(automaticData.dailyProfit - oldData.dailyProfit),
          live: Math.abs(automaticData.liveProfit - oldData.liveProfit),
          status: automaticData.status !== oldData.status
        }
      });

      // Aktualizuj aj capital API pre kompatibilitu
      try {
        const capitalPayload = {
          amount: automaticData.equity,
          dailyProfit: automaticData.dailyProfit,
          liveTradeProfit: automaticData.liveProfit,
          tradingStatus: automaticData.status,
          secret: process.env.API_SECRET
        };

        const capitalResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capitalPayload)
        });

        if (capitalResponse.ok) {
          console.log('📊 Capital API auto-synced successfully');
        } else {
          console.log('⚠️ Capital API auto-sync failed:', capitalResponse.status);
        }
      } catch (error) {
        console.log('⚠️ Capital API auto-sync error:', error.message);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Automatic data updated successfully',
          data: automaticData,
          previousData: oldData
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('❌ Automatic live-sync error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
