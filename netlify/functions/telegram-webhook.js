// AGREGÁTOR dát z rôznych trading párov
let aggregatedData = {
  totalEquity: 0,
  pairs: {}, // Údaje z jednotlivých párov
  lastUpdate: 0,
  pendingUpdate: null // Timeout pre odoslanie dát
};

// Funkcia na agregáciu dát z všetkých párov
function aggregateAllPairs() {
  const pairs = Object.keys(aggregatedData.pairs);
  
  if (pairs.length === 0) {
    console.log('❌ No pairs data available for aggregation');
    return null;
  }
  
  // Spočítaj celkový equity zo všetkých párov
  let totalEquity = 0;
  let totalLiveProfit = 0;
  let activePairs = [];
  let allStatuses = [];
  
  pairs.forEach(pair => {
    const pairData = aggregatedData.pairs[pair];
    totalEquity += pairData.equity || 0;
    totalLiveProfit += pairData.live || 0;
    
    if (pairData.status && pairData.status !== 'No positions') {
      activePairs.push(`${pair}: ${pairData.status}`);
    }
    
    allStatuses.push(pairData.status || 'No positions');
  });
  
  // Určí celkový status
  let overallStatus = 'No positions';
  if (activePairs.length > 0) {
    overallStatus = activePairs.join(', ');
  } else if (totalLiveProfit !== 0) {
    overallStatus = `Trading (${totalLiveProfit >= 0 ? '+' : ''}${totalLiveProfit.toFixed(2)}€)`;
  }
  
  const result = {
    equity: totalEquity,
    daily: 0, // Bude vypočítané API na základe daily tracking
    live: totalLiveProfit,
    status: overallStatus,
    pairsCount: pairs.length,
    activePairs: activePairs.length,
    pairs: pairs
  };
  
  console.log('🔄 AGGREGATED DATA:', result);
  return result;
}

// Funkcia na odoslanie agregovaných dát na web
async function sendAggregatedDataToWeb() {
  const aggregated = aggregateAllPairs();
  
  if (!aggregated) {
    console.log('❌ No data to send to web');
    return false;
  }
  
  try {
    console.log('🌐 Sending aggregated data to web:', aggregated);
    
    const liveResponse = await fetch('https://minco.netlify.app/.netlify/functions/live-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aggregated)
    });
    
    if (liveResponse.ok) {
      console.log('✅ Web updated successfully with aggregated data');
      return true;
    } else {
      console.error('❌ Failed to update web:', liveResponse.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending to web:', error);
    return false;
  }
}

// Funkcia na plánovanie odoslania (debouncing)
function scheduleWebUpdate() {
  // Zruš predchádzajúci timeout
  if (aggregatedData.pendingUpdate) {
    clearTimeout(aggregatedData.pendingUpdate);
  }
  
  // Naplánuj nové odoslanie za 2 sekundy
  aggregatedData.pendingUpdate = setTimeout(() => {
    sendAggregatedDataToWeb();
    aggregatedData.pendingUpdate = null;
  }, 2000);
  
  console.log('⏰ Web update scheduled in 2 seconds');
}

exports.handler = async (event, context) => {
  console.log('=== TELEGRAM WEBHOOK RECEIVED ===');
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
      console.log('📱 Telegram message:', message);
      
      // Spracuj EQUITY správu z MT5
      if (message.startsWith('EQUITY:')) {
        const parts = message.split('|');
        const equity = parseFloat(parts[0].split(':')[1]);
        const daily = parseFloat(parts[1].split(':')[1]);
        const live = parseFloat(parts[2].split(':')[1]);
        const status = parts[3].split(':')[1].trim();
        
        console.log('📊 Parsed MT5 values:', { equity, daily, live, status });
        
        if (!isNaN(equity)) {
          // Urči trading pár z správy (ak je uvedený) alebo použije default
          let tradingPair = 'UNKNOWN';
          
          // Pokús sa extrahovať pár zo status alebo z kontextu
          if (status.includes('EURUSD')) tradingPair = 'EURUSD';
          else if (status.includes('GOLD')) tradingPair = 'GOLD';
          else if (status.includes('GBPUSD')) tradingPair = 'GBPUSD';
          else if (status.includes('USDJPY')) tradingPair = 'USDJPY';
          else {
            // Ak sa nepodarí určiť pár, použije timestamp ako identifier
            tradingPair = `PAIR_${Date.now()}`;
          }
          
          console.log(`📈 Processing data for pair: ${tradingPair}`);
          
          // Aktualizuj dáta pre tento pár
          aggregatedData.pairs[tradingPair] = {
            equity: equity,
            daily: daily,
            live: live,
            status: status,
            lastUpdate: Date.now()
          };
          
          console.log('🔄 Updated pair data:', aggregatedData.pairs[tradingPair]);
          console.log('📊 All pairs status:', Object.keys(aggregatedData.pairs));
          
          // Naplánuj odoslanie agregovaných dát na web
          scheduleWebUpdate();
          
          // Pošli potvrdenie do Telegram
          await sendTelegramMessage(chatId, 
            `✅ <b>Data Received (${tradingPair})</b>\n` +
            `💰 Equity: <b>${equity.toFixed(2)}€</b>\n` +
            `📈 Daily: <b>${daily >= 0 ? '+' : ''}${daily.toFixed(2)}€</b>\n` +
            `📊 Live: <b>${live >= 0 ? '+' : ''}${live.toFixed(2)}€</b>\n` +
            `🎯 Status: <code>${status}</code>\n` +
            `🔄 Pairs active: <b>${Object.keys(aggregatedData.pairs).length}</b>`
          );
          
          return { 
            statusCode: 200, 
            headers, 
            body: JSON.stringify({ 
              success: true, 
              message: 'Data aggregated successfully',
              pair: tradingPair,
              totalPairs: Object.keys(aggregatedData.pairs).length
            }) 
          };
        }
      }
    }
    
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ received: true }) 
    };
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
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
    console.error('❌ Error sending telegram message:', error);
    return false;
  }
}
