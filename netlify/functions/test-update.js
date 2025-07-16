exports.handler = async (event, context) => {
  try {
    // Simuluj update z MT5
    const response = await fetch(`${process.env.SITE_URL}/.netlify/functions/capital`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 91.84,
        dailyProfit: 0.06,
        liveTradeProfit: -0.13,
        tradingStatus: 'EURUSD Short',
        secret: process.env.API_SECRET
      })
    });

    const result = await response.json();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Test update completed',
        result: result
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
