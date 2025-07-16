exports.handler = async (event, context) => {
  try {
    const response = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 91.85,
        dailyProfit: 0.00,
        liveTradeProfit: -0.01,
        tradingStatus: 'EURUSD 0.01 Short',
        secret: 'minco_secret_2024'
      })
    });
    
    const result = await response.json();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true, 
        message: 'Capital force updated',
        result: result 
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: error.message 
      })
    };
  }
};
