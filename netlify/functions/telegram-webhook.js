exports.handler = async (event, context) => {
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Method:', event.httpMethod);
  console.log('Body:', event.body);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
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
    
    // Telegram správa
    if (body.message && body.message.text) {
      const message = body.message.text;
      const chatId = body.message.chat.id;
      console.log('Telegram message:', message);
      
      // Spracuj EQUITY správu z MT5
      if (message.startsWith('EQUITY:')) {
        const parts = message.split('|');
        const equity = parseFloat(parts[0].split(':')[1]);
        const daily = parseFloat(parts[1].split(':')[1]);
        const live = parseFloat(parts[2].split(':')[1]);
        const status = parts[3].split(':')[1].trim();
        
        console.log('Parsed values:', { equity, daily, live, status });
        
        if (!isNaN(equity)) {
          // Aktualizuj live-sync API
          const liveResponse = await fetch('https://minco.netlify.app/.netlify/functions/live-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              equity: equity,
              daily: daily,
              live: live,
              status: status
            })
          });
          
          if (liveResponse.ok) {
            console.log('Live-sync updated successfully');
            
            // Pošli potvrdenie do Telegram
            await sendTelegramMessage(chatId, `✅ <b>Live Update</b>\n💰 Equity: <b>${equity.toFixed(2)}€</b>\n📈 Daily: <b>${daily >= 0 ? '+' : ''}${daily.toFixed(2)}€</b>\n📊 Live: <b>${live >= 0 ? '+' : ''}${live.toFixed(2)}€</b>\n🎯 Status: <code>${status}</code>`);
            
            return { 
              statusCode: 200, 
              headers, 
              body: JSON.stringify({ success: true, message: 'Live data updated' }) 
            };
          } else {
            console.error('Failed to update live-sync:', liveResponse.status);
          }
        }
      }
    }
    
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ received: true }) 
    };
    
  } catch (error) {
    console.error('Webhook error:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
};

async function sendTelegramMessage(chatId, text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error sending telegram message:', error);
    return false;
  }
}
