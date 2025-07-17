// Live-sync iba spracováva a predáva dáta do capital.js
// Neuchováva žiadne dáta v pamäti (kvôli cold start problémom)

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
      // PRESMERUJE na capital API (hlavné úložisko)
      console.log('Redirecting GET request to capital API');
      
      try {
        const capitalResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (capitalResponse.ok) {
          const capitalData = await capitalResponse.json();
          console.log('Retrieved data from capital API:', capitalData);
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              amount: capitalData.amount,
              dailyProfit: capitalData.dailyProfit,
              totalProfit: capitalData.totalProfit,
              liveTradeProfit: capitalData.liveTradeProfit,
              tradingStatus: capitalData.tradingStatus,
              lastUpdate: capitalData.lastUpdate,
              status: 'success',
              timestamp: Date.now(),
              dataSource: 'capital_api'
            })
          };
        } else {
          throw new Error(`Capital API returned ${capitalResponse.status}`);
        }
      } catch (error) {
        console.error('Error fetching from capital API:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to fetch capital data' })
        };
      }
    }

    if (event.httpMethod === 'POST') {
      // Aktualizuj dáta (z MT5) a uloží do capital API
      const body = JSON.parse(event.body || '{}');
      console.log('Received POST data from MT5:', body);
      
      if (body.equity !== undefined) {
        const newData = {
          equity: parseFloat(body.equity),
          daily: parseFloat(body.daily) || 0,
          live: parseFloat(body.live) || 0,
          status: body.status || 'Trading',
          lastUpdate: new Date().toISOString()
        };

        console.log('Processing MT5 data:', newData);

        // Aktualizuj hlavné capital API (perzistentné úložisko)
        try {
          const capitalResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: newData.equity,
              dailyProfit: newData.daily,
              liveTradeProfit: newData.live,
              tradingStatus: newData.status,
              secret: process.env.API_SECRET
            })
          });
          
          if (capitalResponse.ok) {
            console.log('Capital API updated successfully');
            const updatedData = await capitalResponse.json();
            
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ 
                success: true, 
                message: 'Live data updated and stored in capital API',
                data: updatedData.data
              })
            };
          } else {
            throw new Error(`Capital API update failed: ${capitalResponse.status}`);
          }
        } catch (error) {
          console.error('Error updating capital API:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to update capital API' })
          };
        }
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
