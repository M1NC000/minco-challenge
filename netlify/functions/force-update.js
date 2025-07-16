exports.handler = async (event, context) => {
  try {
    // Získaj najnovšie údaje z Telegram Bot API
    const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=-1&limit=1`);
    const telegramData = await telegramResponse.json();
    
    if (telegramData.ok && telegramData.result.length > 0) {
      const lastMessage = telegramData.result[0].message;
      
      if (lastMessage && lastMessage.text && lastMessage.text.startsWith('EQUITY:')) {
        // Parse poslednej MT5 správy
        const message = lastMessage.text;
        const parts = message.split('|');
        const equity = parseFloat(parts[0].split(':')[1]);
        const daily = parseFloat(parts[1].split(':')[1]);
        const live = parseFloat(parts[2].split(':')[1]);
        const status = parts[3].split(':')[1].trim();
        
        // Aktualizuj capital s live údajmi
        const response = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
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
        
        const result = await response.json();
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            success: true, 
            liveData: { equity, daily, live, status },
            result 
          })
        };
      }
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'No recent EQUITY messages found' })
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
