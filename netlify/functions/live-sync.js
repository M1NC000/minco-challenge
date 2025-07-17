// Live data storage (in memory) - BEZ POČIATOČNÝCH HODNÔT
let liveData = null; // Začína ako null

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
      // Ak nie sú žiadne dáta, vráť štartové hodnoty
      if (!liveData) {
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
            timestamp: Date.now()
          })
        };
      }
      
      // Vráť aktuálne live dáta
      console.log('Returning live data:', liveData);
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
          timestamp: Date.now()
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

        console.log('Updated live data:', { old: oldData, new: liveData });

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
            data: liveData 
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
