// SIMPLE PROXY live-sync - Všetko presmeruje na capital.js
// Neuchováva ŽIADNE dáta, len spracováva a presmerováva

exports.handler = async (event, context) => {
  console.log('🔄 PROXY Live-sync called:', event.httpMethod);
  
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
      // PROXY - presmeruj na capital API
      console.log('🔄 Proxying GET request to capital API');
      
      try {
        const capitalResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (capitalResponse.ok) {
          const capitalData = await capitalResponse.json();
          console.log('🔄 Retrieved from capital API:', capitalData);
          
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
              dataSource: 'proxy_to_capital'
            })
          };
        } else {
          throw new Error(`Capital API returned ${capitalResponse.status}`);
        }
      } catch (error) {
        console.error('🔄 Error proxying to capital API:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to fetch from capital API' })
        };
      }
    }

    if (event.httpMethod === 'POST') {
      // PROXY - spracuj a presmeruj na capital API
      const body = JSON.parse(event.body || '{}');
      console.log('🔄 Proxying POST data to capital API:', body);
      
      if (body.equity === undefined) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing equity data' })
        };
      }

      // Priprav dáta pre capital API
      const capitalPayload = {
        amount: parseFloat(body.equity),
        secret: process.env.API_SECRET
      };

      // Pridaj ostatné dáta ak sú dostupné
      if (body.dailyProfit !== undefined && !isNaN(parseFloat(body.dailyProfit))) {
        capitalPayload.dailyProfit = parseFloat(body.dailyProfit);
      }

      if (body.liveProfit !== undefined && !isNaN(parseFloat(body.liveProfit))) {
        capitalPayload.liveTradeProfit = parseFloat(body.liveProfit);
      }

      if (body.status && body.status.trim() !== '') {
        capitalPayload.tradingStatus = body.status;
      }

      console.log('🔄 Sending to capital API:', capitalPayload);

      try {
        const capitalResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capitalPayload)
        });

        if (capitalResponse.ok) {
          const result = await capitalResponse.json();
          console.log('🔄 Capital API updated successfully');
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'Data proxied to capital API successfully',
              data: result.data
            })
          };
        } else {
          throw new Error(`Capital API returned ${capitalResponse.status}`);
        }
      } catch (error) {
        console.error('🔄 Error updating capital API:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to update capital API' })
        };
      }
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('🔄 Proxy live-sync error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
