exports.handler = async (event, context) => {
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Method:', event.httpMethod);
  console.log('Headers:', JSON.stringify(event.headers, null, 2));
  console.log('Body:', event.body);
  console.log('========================');
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS preflight request
  if (event.httpMethod === 'OPTIONS') {
    console.log('OPTIONS request - returning CORS headers');
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ message: 'CORS preflight' })
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    console.log('Non-POST request received:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        error: 'Method not allowed', 
        method: event.httpMethod,
        allowed: 'POST'
      })
    };
  }

  try {
    // Parse incoming request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid JSON in request body',
          details: parseError.message
        })
      };
    }

    console.log('Parsed body:', JSON.stringify(body, null, 2));
    
    // Check if this is a Telegram webhook message
    if (body.message && body.message.text) {
      const message = body.message.text;
      const chatId = body.message.chat.id;
      const messageId = body.message.message_id;
      const timestamp = body.message.date;
      
      console.log('=== TELEGRAM MESSAGE ===');
      console.log('Chat ID:', chatId);
      console.log('Message ID:', messageId);
      console.log('Timestamp:', timestamp);
      console.log('Message:', message);
      console.log('========================');
      
      // Process MT5 EQUITY messages
      if (message.startsWith('EQUITY:')) {
        console.log('Processing MT5 EQUITY message...');
        
        try {
          // Parse message format: EQUITY:91.80|DAILY:0.00|LIVE:-0.06|STATUS:EURUSD 0.01 Short
          const parts = message.split('|');
          console.log('Message parts:', parts);
          
          if (parts.length < 4) {
            throw new Error('Invalid message format - expected 4 parts');
          }
          
          const equity = parseFloat(parts[0].split(':')[1]);
          const daily = parseFloat(parts[1].split(':')[1]);
          const live = parseFloat(parts[2].split(':')[1]);
          const status = parts[3].split(':')[1].trim();
          
          console.log('=== PARSED VALUES ===');
          console.log('Equity:', equity);
          console.log('Daily Profit:', daily);
          console.log('Live P&L:', live);
          console.log('Trade Status:', status);
          console.log('====================');
          
          // Validate parsed values
          if (isNaN(equity)) {
            throw new Error(`Invalid equity value: ${parts[0]}`);
          }
          if (isNaN(daily)) {
            throw new Error(`Invalid daily value: ${parts[1]}`);
          }
          if (isNaN(live)) {
            throw new Error(`Invalid live value: ${parts[2]}`);
          }
          if (!status || status.length === 0) {
            throw new Error('Missing trade status');
          }
          
          // Update capital via internal API
          console.log('Updating capital via API...');
          const updatePayload = {
            amount: equity,
            dailyProfit: daily,
            liveTradeProfit: live,
            tradingStatus: status,
            secret: process.env.API_SECRET
          };
          
          console.log('Update payload:', JSON.stringify(updatePayload, null, 2));
          
          const updateResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'Netlify-Webhook/1.0'
            },
            body: JSON.stringify(updatePayload)
          });
          
          console.log('Update response status:', updateResponse.status);
          console.log('Update response headers:', JSON.stringify([...updateResponse.headers.entries()]));
          
          if (updateResponse.ok) {
            const updateResult = await updateResponse.json();
            console.log('Update result:', JSON.stringify(updateResult, null, 2));
            
            // Send confirmation to Telegram
            const confirmationMessage = `✅ <b>Capital Updated</b>\n` +
                                      `💰 Equity: <b>${equity.toFixed(2)}€</b>\n` +
                                      `📈 Daily: <b>${daily >= 0 ? '+' : ''}${daily.toFixed(2)}€</b>\n` +
                                      `📊 Live: <b>${live >= 0 ? '+' : ''}${live.toFixed(2)}€</b>\n` +
                                      `🎯 Status: <code>${status}</code>\n` +
                                      `⏰ ${new Date().toLocaleString('sk-SK')}`;
            
            await sendTelegramMessage(chatId, confirmationMessage);
            
            return { 
              statusCode: 200, 
              headers, 
              body: JSON.stringify({ 
                success: true,
                message: 'Capital updated successfully',
                data: {
                  equity,
                  daily,
                  live,
                  status,
                  timestamp: new Date().toISOString()
                }
              })
            };
          } else {
            const errorText = await updateResponse.text();
            console.error('Failed to update capital:', updateResponse.status, errorText);
            
            // Send error notification to Telegram
            await sendTelegramMessage(chatId, `❌ <b>Update Failed</b>\n<code>Status: ${updateResponse.status}</code>\n<code>${errorText}</code>`);
            
            return { 
              statusCode: 500, 
              headers, 
              body: JSON.stringify({ 
                error: 'Failed to update capital',
                status: updateResponse.status,
                details: errorText
              })
            };
          }
          
        } catch (parseError) {
          console.error('Error parsing MT5 message:', parseError);
          
          // Send parsing error to Telegram
          await sendTelegramMessage(chatId, `❌ <b>Parsing Error</b>\n<code>${parseError.message}</code>\n\nMessage: <code>${message}</code>`);
          
          return { 
            statusCode: 400, 
            headers, 
            body: JSON.stringify({ 
              error: 'Failed to parse MT5 message',
              message: message,
              details: parseError.message
            })
          };
        }
      } else {
        // Handle other message types
        console.log('Non-EQUITY message received:', message);
        
        // Send help message for unknown commands
        if (message.startsWith('/')) {
          const helpMessage = `🤖 <b>MINCO Bot Commands</b>\n\n` +
                            `📊 Send EQUITY data from MT5:\n` +
                            `<code>EQUITY:amount|DAILY:profit|LIVE:pnl|STATUS:info</code>\n\n` +
                            `💡 Example:\n` +
                            `<code>EQUITY:91.80|DAILY:0.00|LIVE:-0.06|STATUS:EURUSD Short</code>`;
          
          await sendTelegramMessage(chatId, helpMessage);
        }
        
        return { 
          statusCode: 200, 
          headers, 
          body: JSON.stringify({ 
            received: true, 
            message: 'Non-EQUITY message processed',
            text: message
          })
        };
      }
    } else {
      // Handle non-message webhooks (like bot status updates)
      console.log('Non-message webhook received');
      console.log('Webhook type:', Object.keys(body));
      
      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ 
          received: true, 
          message: 'Webhook processed',
          type: Object.keys(body)
        })
      };
    }
    
  } catch (error) {
    console.error('=== WEBHOOK ERROR ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error('====================');
    
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

/**
 * Send message to Telegram chat
 * @param {string|number} chatId - Telegram chat ID
 * @param {string} text - Message text (supports HTML formatting)
 */
async function sendTelegramMessage(chatId, text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN environment variable not set');
    return false;
  }
  
  if (!chatId) {
    console.error('Chat ID not provided');
    return false;
  }
  
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  
  console.log('=== SENDING TELEGRAM MESSAGE ===');
  console.log('URL:', url);
  console.log('Chat ID:', chatId);
  console.log('Message:', text);
  console.log('================================');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Netlify-Webhook/1.0'
      },
      body: JSON.stringify(payload)
    });
    
    console.log('Telegram API response status:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('Telegram message sent successfully:', result.result.message_id);
      return true;
    } else {
      const errorText = await response.text();
      console.error('Failed to send telegram message:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error('Error sending telegram message:', error);
    return false;
  }
}
