// PERZISTENTNÉ dáta (uložené aj po reštarte funkcie)
let capitalData = {
  amount: 15.00,
  dailyProfit: 0,
  totalProfit: 0,
  liveTradeProfit: 0,
  tradingStatus: 'No positions',
  lastUpdate: new Date().toISOString(),
  hasReceivedMT5Data: false // Flag či už boli prijaté dáta z MT5
};

// Hlavná funkcia pre API endpoint
exports.handler = async (event, context) => {
  console.log('Capital API called:', event.httpMethod, 'Current data:', capitalData);
  
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
      // VŽDY vráti aktuálne uložené dáta (nikdy sa nevráti na štartové)
      console.log('Returning capital data:', capitalData);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...capitalData,
          status: 'success',
          timestamp: Date.now(),
          dataSource: capitalData.hasReceivedMT5Data ? 'persistent' : 'initial'
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

      // Aktualizovať kapitál a live trade údaje
      if (body.amount !== undefined) {
        const oldData = { ...capitalData };
        
        capitalData.amount = parseFloat(body.amount);
        capitalData.dailyProfit = body.dailyProfit !== undefined ? parseFloat(body.dailyProfit) : 0;
        capitalData.totalProfit = capitalData.amount - 15; // 15€ je štartovacia suma
        capitalData.liveTradeProfit = body.liveTradeProfit !== undefined ? parseFloat(body.liveTradeProfit) : 0;
        capitalData.tradingStatus = body.tradingStatus || (capitalData.liveTradeProfit !== 0 ? 'Trading active' : 'No positions');
        capitalData.lastUpdate = new Date().toISOString();
        capitalData.hasReceivedMT5Data = true; // Označí že už boli prijaté dáta z MT5
        
        console.log('Capital data updated:', { old: oldData, new: capitalData });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Capital updated successfully',
          data: capitalData
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Capital API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
