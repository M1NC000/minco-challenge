exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    
    // Validácia Telegram webhook
    if (!body.message || !body.message.text) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid telegram message' })
      };
    }

    const message = body.message.text;
    const chatId = body.message.chat.id;

    // Spracovanie MT5 údajov
    // Nový formát: "EQUITY:25.50|DAILY:2.30|LIVE:-1.20|STATUS:EUR/USD Long"
    if (message.startsWith('EQUITY:')) {
      const parts = message.split('|');
      const equity = parseFloat(parts[0].split(':')[1]);
      const daily = parts[1] ? parseFloat(parts[1].split(':')[1]) : 0;
      const live = parts[2] ? parseFloat(parts[2].split(':')[1]) : 0;
      const status = parts[3] ? parts[3].split(':')[1] : 'Trading aktívny';
      
      if (!isNaN(equity)) {
        // Aktualizovať kapitál cez našu API
        const updateResponse = await fetch(`${process.env.SITE_URL}/.netlify/functions/capital`, {
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

        if (updateResponse.ok) {
          // Odošlať potvrdenie do Telegram
          await sendTelegramMessage(chatId, `✅ Kapitál: ${equity}€\n💰 Live: ${live >= 0 ? '+' : ''}${live}€`);
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Webhook processed' })
    };

  } catch (error) {
    console.error('Telegram webhook error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

async function sendTelegramMessage(chatId, text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
  } catch (error) {
    console.error('Failed to send telegram message:', error);
  }
}
