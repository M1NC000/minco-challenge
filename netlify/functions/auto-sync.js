// Scheduled function - beží každých 30 sekúnd
exports.handler = async (event, context) => {
  try {
    console.log('Auto-sync triggered at:', new Date().toISOString());
    
    // Získaj najnovšie údaje z Telegram
    const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=-1&limit=1`);
    const telegramData = await telegramResponse.json();
    
    if (telegramData.ok && telegramData.result.length > 0) {
      const lastMessage = telegramData.result[0].message;
      
      if (lastMessage && lastMessage.text && lastMessage.text.startsWith('EQUITY:')) {
        const message = lastMessage.text;
        const parts = message.split('|');
        const equity = parseFloat(parts[0].split(':')[1]);
        const daily = parseFloat(parts[1].split(':')[1]);
        const live = parseFloat(parts[2].split(':')[1]);
        const status = parts[3].split(':')[1].trim();
        
        console.log('Updating with live data:', { equity, daily, live, status });
        
        // Aktualizuj capital
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
        
        if (response.ok) {
          console.log('Capital updated successfully');
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true, updated: true, data: { equity, daily, live, status } })
          };
        }
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, updated: false, message: 'No new data' })
    };
    
  } catch (error) {
    console.error('Auto-sync error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
