// Live data storage (in memory) - ZACHOVÁVA POSLEDNÉ HODNOTY
let liveData = null; // Začína ako null
let lastValidData = null; // Ukladá posledné platné dáta z MT5

exports.handler = async (event, context) => {
  console.log('Live-sync called:', event.httpMethod, new Date().toISOString());
  
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
      // Ak máme uložené posledné platné dáta, vráť ich
      if (lastValidData) {
        console.log('Returning last valid data:', lastValidData);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            amount: lastValidData.equity,
            dailyProfit: lastValidData.daily,
            totalProfit: lastValidData.equity - 15,
            liveTradeProfit: lastValidData.live,
            tradingStatus: lastValidData.status,
            lastUpdate: lastValidData.lastUpdate,
            status: 'success',
            timestamp: Date.now(),
            dataSource: 'cached' // Indikuje že sú to uložené dáta
          })
        };
      }
      
      // Ak máme aktuálne live dáta, vráť ich
      if (liveData) {
        console.log('Returning current live data:', liveData);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            amount: liveData.equity,
            dailyProfit: liveData.daily,
            totalProfit: liveData.equity - 15,
            liveTradeProfit: liveData.live,
            tradingStatus: liveData.status,
            lastUpdate: liveData.lastUpdate,
            status: 'success',
            timestamp: Date.now(),
            dataSource: 'live'
          })
        };
      }
      
      // Ak nie sú žiadne dáta, vráť štartové hodnoty (len prvý krát)
      console.log('No data available, returning initial values');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          amount: 15,
          dailyProfit: 0,
          totalProfit: 0,
          liveTradeProfit: 0,
          tradingStatus: 'No positions',
          lastUpdate: new Date().toISOString(),
          status: 'success',
          timestamp: Date.now(),
          dataSource: 'initial'
        })
      };
    }

    if (event.httpMethod === 'POST') {
      // Aktualizuj live dáta (z MT5)
      const body = JSON.parse(event.body || '{}');
      console.log('Received POST data:', body);
      
      if (body.equity !== undefined) {
        const oldData = liveData ? { ...liveData } : null;
        
        // ULOŽÍ NAJNOVŠIE ÚDAJE Z MT5
        liveData = {
          equity: parseFloat(body.equity),
          daily: parseFloat(body.daily) || 0,
          live: parseFloat(body.live) || 0,
          status: body.status || 'Trading',
          lastUpdate: new Date().toISOString()
        };

        // ULOŽÍ AKO POSLEDNÉ PLATNÉ DÁTA (backup pre prípad odpojenia)
        lastValidData = { ...liveData };

        console.log('Updated live data:', { old: oldData, new: liveData });
        console.log('Saved as last valid data:', lastValidData);

        // Aktualizuj aj hlavné capital API
        try {
          const capitalResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: liveData.equity,
              dailyProfit: liveData.daily,
              liveTradeProfit: liveData.live,
              tradingStatus: liveData.status,
              secret: process.env.API_SECRET
            })
          });
          
          if (capitalResponse.ok) {
            console.log('Capital API updated successfully');
          }
        } catch (error) {
          console.error('Error updating capital API:', error);
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Live data updated and stored',
            data: liveData,
            backup: 'Last valid data saved'
          })
        };
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing equity data' })
        };
      }
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Live-sync error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
