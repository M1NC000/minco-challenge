exports.handler = async (event, context) => {
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Method:', event.httpMethod);
  console.log('Body:', event.body);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    
    // Telegram správa
    if (body.message && body.message.text) {
      const message = body.message.text;
      console.log('Telegram message:', message);
      
      // Spracuj EQUITY správu z MT5
      if (message.startsWith('EQUITY:')) {
        const parts = message.split('|');
        const equity = parseFloat(parts[0].split(':')[1]);
        const daily = parts[1] ? parseFloat(parts[1].split(':')[1]) : 0;
        const live = parts[2] ? parseFloat(parts[2].split(':')[1]) : 0;
        const status = parts[3] ? parts[3].split(':')[1].trim() : 'No positions';
        
        console.log('Parsed:', { equity, daily, live, status });
        
        // Aktualizuj capital
        const updateResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: equity,
            dailyProfit: daily,
            liveTradeProfit: live,
            tradingStatus: status,
            secret: process.env.API_SECRET
          })
        });
        
        console.log('Update response status:', updateResponse.status);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }
    }
    
    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
    
  } catch (error) {
    console.error('Webhook error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
