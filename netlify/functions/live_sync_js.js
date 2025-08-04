// KOMPLETNÝ VYLEPŠENÝ PROXY live-sync v2.0
// Inteligentne spracováva a presmerováva všetky dáta na capital.js
// Podporuje všetky nové funkcie: denný zisk, ciele, perzistentné dáta, error handling

exports.handler = async (event, context) => {
  console.log('🔄 VYLEPŠENÝ Live-sync v2.0 called:', event.httpMethod, 'at', new Date().toISOString());
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ message: 'CORS preflight OK' })
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      // PROXY GET - presmeruj na capital API pre získanie dát
      console.log('🔄 Proxying GET request to capital API');
      
      try {
        const startTime = Date.now();
        
        const capitalResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
          method: 'GET',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'MINCO-LiveSync-v2.0'
          },
          timeout: 8000 // 8 sekúnd timeout
        });
        
        const responseTime = Date.now() - startTime;
        
        if (capitalResponse.ok) {
          const capitalData = await capitalResponse.json();
          
          console.log('🔄 Retrieved from capital API:', {
            amount: capitalData.amount,
            dailyProfit: capitalData.dailyProfit,
            totalProfit: capitalData.totalProfit,
            goalsCount: capitalData.goalsAchieved ? Object.keys(capitalData.goalsAchieved).length : 0,
            historyDays: capitalData.dailyHistory ? Object.keys(capitalData.dailyHistory).length : 0,
            responseTime: responseTime + 'ms'
          });
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              // Hlavné dáta
              amount: capitalData.amount,
              dailyProfit: capitalData.dailyProfit,
              totalProfit: capitalData.totalProfit,
              liveTradeProfit: capitalData.liveTradeProfit,
              tradingStatus: capitalData.tradingStatus,
              lastUpdate: capitalData.lastUpdate,
              
              // Rozšírené funkcie v2.0
              goalsAchieved: capitalData.goalsAchieved || {},
              dailyHistory: capitalData.dailyHistory || {},
              
              // Metadata
              status: 'success',
              timestamp: Date.now(),
              dataSource: 'enhanced_proxy_to_capital_v2',
              responseTime: responseTime,
              
              // Rozšírené debug info
              debug: {
                ...capitalData.debug,
                proxyVersion: '2.0',
                enhancedFeatures: true,
                capitalApiResponseTime: responseTime,
                proxyTimestamp: new Date().toISOString()
              }
            })
          };
        } else {
          const errorText = await capitalResponse.text();
          throw new Error(`Capital API returned ${capitalResponse.status}: ${errorText}`);
        }
        
      } catch (error) {
        console.error('🔄 Error proxying to capital API:', error.message);
        
        // Inteligentný fallback response
        return {
          statusCode: 200, // Vráť 200 aby frontend fungoval
          headers,
          body: JSON.stringify({
            // Minimálne dáta pre funkčnosť
            amount: 15,
            dailyProfit: 0,
            totalProfit: 0,
            liveTradeProfit: 0,
            tradingStatus: 'Connection Error - Using Fallback',
            lastUpdate: new Date().toISOString(),
            
            // Prázdne rozšírené dáta
            goalsAchieved: {},
            dailyHistory: {},
            
            // Error metadata
            status: 'fallback',
            timestamp: Date.now(),
            dataSource: 'proxy_fallback_default',
            error: 'Capital API unavailable - using safe defaults',
            errorDetails: error.message,
            
            debug: {
              proxyVersion: '2.0',
              fallbackMode: true,
              originalError: error.message,
              fallbackTimestamp: new Date().toISOString()
            }
          })
        };
      }
    }

    if (event.httpMethod === 'POST') {
      // VYLEPŠENÝ PROXY POST - spracuj a presmeruj na capital API
      const body = JSON.parse(event.body || '{}');
      
      console.log('🔄 Proxying POST data to capital API:', {
        equity: body.equity,
        dailyProfit: body.dailyProfit,
        liveProfit: body.liveProfit,
        status: body.status,
        timestamp: body.timestamp,
        hasSecret: !!body.secret,
        dataSize: JSON.stringify(body).length + ' bytes'
      });
      
      // Validácia vstupných dát
      if (body.equity === undefined || body.equity === null) {
        console.warn('🔄 Invalid request - missing equity data');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Missing required field: equity',
            required: ['equity'],
            received: Object.keys(body),
            timestamp: Date.now(),
            proxyVersion: '2.0'
          })
        };
      }

      // Validácia číselných hodnôt
      const equityValue = parseFloat(body.equity);
      if (isNaN(equityValue) || equityValue < 0) {
        console.warn('🔄 Invalid equity value:', body.equity);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Invalid equity value - must be a positive number',
            receivedValue: body.equity,
            timestamp: Date.now()
          })
        };
      }

      // Priprav vylepšené dáta pre capital API
      const capitalPayload = {
        amount: equityValue,
        secret: process.env.API_SECRET || body.secret
      };

      // Pridaj rozšírené dáta ak sú dostupné a validné
      if (body.dailyProfit !== undefined && !isNaN(parseFloat(body.dailyProfit))) {
        capitalPayload.dailyProfit = parseFloat(body.dailyProfit);
        console.log('🔄 Including dailyProfit from MT5:', capitalPayload.dailyProfit);
      }

      if (body.liveProfit !== undefined && !isNaN(parseFloat(body.liveProfit))) {
        capitalPayload.liveTradeProfit = parseFloat(body.liveProfit);
        console.log('🔄 Including liveProfit from MT5:', capitalPayload.liveTradeProfit);
      }

      if (body.status && typeof body.status === 'string' && body.status.trim() !== '') {
        capitalPayload.tradingStatus = body.status.trim();
        console.log('🔄 Including trading status from MT5:', capitalPayload.tradingStatus);
      }

      // Pridaj metadata pre lepšie sledovanie
      capitalPayload.receivedAt = new Date().toISOString();
      capitalPayload.proxyVersion = '2.0';
      capitalPayload.sourceIP = event.headers?.['x-forwarded-for'] || event.headers?.['x-real-ip'] || 'unknown';
      
      // Ak máme dodatočné MT5 dáta
      if (body.account) capitalPayload.accountInfo = body.account;
      if (body.server) capitalPayload.serverInfo = body.server;
      if (body.version) capitalPayload.eaVersion = body.version;

      console.log('🔄 Sending enhanced payload to capital API:', {
        ...capitalPayload,
        secret: '***hidden***', // Skry secret v logoch
        payloadSize: JSON.stringify(capitalPayload).length + ' bytes'
      });

      try {
        const startTime = Date.now();
        
        const capitalResponse = await fetch('https://minco.netlify.app/.netlify/functions/capital', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'MINCO-LiveSync-v2.0'
          },
          body: JSON.stringify(capitalPayload),
          timeout: 10000 // 10 sekúnd timeout
        });

        const responseTime = Date.now() - startTime;

        if (capitalResponse.ok) {
          const result = await capitalResponse.json();
          
          console.log('🔄 Capital API updated successfully:', {
            equity: result.data?.equity,
            dailyProfit: result.data?.dailyProfit,
            totalUpdates: result.data?.totalUpdates,
            goalsAchieved: result.data?.goalsAchieved,
            responseTime: responseTime + 'ms'
          });
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'Enhanced data proxied to capital API successfully',
              data: {
                equity: result.data?.equity,
                dailyProfit: result.data?.dailyProfit,
                totalProfit: result.data?.equity ? result.data.equity - 15 : 0,
                goalsAchieved: result.data?.goalsAchieved || 0,
                totalUpdates: result.data?.totalUpdates,
                lastUpdate: result.data?.lastUpdate
              },
              performance: {
                responseTime: responseTime,
                payloadSize: JSON.stringify(capitalPayload).length,
                timestamp: Date.now()
              },
              metadata: {
                proxyVersion: '2.0',
                enhanced: true,
                capitalApiVersion: result.version || 'unknown'
              }
            })
          };
        } else {
          const errorText = await capitalResponse.text();
          throw new Error(`Capital API returned ${capitalResponse.status}: ${errorText}`);
        }
      } catch (error) {
        console.error('🔄 Error updating capital API:', error.message);
        
        // Rozšírený error handling
        let errorType = 'unknown';
        let errorMessage = error.message;
        
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          errorType = 'timeout';
          errorMessage = 'Capital API request timed out';
        } else if (error.message.includes('fetch')) {
          errorType = 'network';
          errorMessage = 'Network error connecting to Capital API';
        } else if (error.message.includes('401')) {
          errorType = 'auth';
          errorMessage = 'Authentication failed with Capital API';
        }
        
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            error: 'Failed to update capital API',
            errorType: errorType,
            errorMessage: errorMessage,
            details: error.message,
            timestamp: Date.now(),
            proxyVersion: '2.0',
            retryable: errorType === 'timeout' || errorType === 'network',
            
            // Debugging info
            debug: {
              originalError: error.message,
              errorStack: error.stack?.split('\n')[0],
              requestPayload: {
                equity: capitalPayload.amount,
                hasSecret: !!capitalPayload.secret,
                payloadKeys: Object.keys(capitalPayload)
              }
            }
          })
        };
      }
    }

    // Nepodporovaná metóda
    console.warn('🔄 Unsupported method:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        error: 'Method not allowed',
        method: event.httpMethod,
        allowed: ['GET', 'POST', 'OPTIONS'],
        timestamp: Date.now(),
        proxyVersion: '2.0'
      })
    };

  } catch (error) {
    console.error('🔄 Enhanced proxy live-sync critical error:', error);
    
    // Critical error fallback
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal proxy server error',
        errorType: 'critical',
        details: error.message,
        timestamp: Date.now(),
        proxyVersion: '2.0',
        
        // Emergency fallback data
        fallbackData: {
          amount: 15,
          dailyProfit: 0,
          totalProfit: 0,
          liveTradeProfit: 0,
          tradingStatus: 'Proxy Error - System Recovery Mode',
          lastUpdate: new Date().toISOString(),
          status: 'emergency_fallback'
        },
        
        debug: {
          errorStack: error.stack?.split('\n').slice(0, 3),
          requestMethod: event.httpMethod,
          requestHeaders: Object.keys(event.headers || {}),
          bodySize: event.body ? event.body.length : 0
        }
      })
    };
  }
};