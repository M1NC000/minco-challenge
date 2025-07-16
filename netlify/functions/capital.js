// Automatické dáta (aktualizované z MT5)
let capitalData = {
  amount: 15.00,
  dailyProfit: 0,
  totalProfit: 0,
  liveTradeProfit: 0,
  tradingStatus: 'No positions',
  lastUpdate: new Date().toISOString()
};

// Hlavná funkcia pre API endpoint
exports.handler = async (event, context) => {
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
      // Vrátiť aktuálne dáta
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...capitalData,
          status: 'success',
          timestamp: Date.now()
        })
      };
    }

    if (event.httpMethod === 'POST') {
      // Aktualizovať dáta (z Telegram botu)
      const body = JSON.parse(event.body || '{}');
      
      // Validácia
      if (body.secret !== process.env.API_SECRET) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' })
        };
      }

      // Aktualizovať kapitál a live trade údaje
      if (body.amount !== undefined) {
        const oldAmount = capitalData.amount;
        capitalData.amount = parseFloat(body.amount);
        capitalData.dailyProfit = body.dailyProfit !== undefined ? parseFloat(body.dailyProfit) : capitalData.amount - oldAmount;
        capitalData.totalProfit = capitalData.amount - 15; // 15€ je štartovacia suma
        capitalData.liveTradeProfit = body.liveTradeProfit !== undefined ? parseFloat(body.liveTradeProfit) : 0;
        capitalData.tradingStatus = body.tradingStatus || (capitalData.liveTradeProfit !== 0 ? 'Trading active' : 'No positions');
        capitalData.lastUpdate = new Date().toISOString();
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
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
