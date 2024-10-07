const WebSocket = require('ws');
const zlib = require('zlib');
const moment = require('moment'); // Ensure moment.js is installed: npm install moment
const convert = require('./convert'); // Make sure this module correctly decodes your data

// Configuration
const serverUrl = 'wss://wsrelay.sensibull.com/broker/1?consumerType=platform_no_plan';
const customHeaders = {
    "Connection": "upgrade",
    "Upgrade": "websocket",
    "Sec-WebSocket-Accept": "CqbDPpldnDoub1dhmTY9tD+JRDs=",
    "Host": "wsrelay.sensibull.com",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "User-Agent": "Mozilla/5.0(Macintosh; Intel Mac OS X 10_15_7) AppleWebKit / 537.36(KHTML, like Gecko) Chrome / 129.0.0.0 Safari / 537.36",
    "Origin": "https://web.sensibull.com",
    "Sec-WebSocket-Version": 13,
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-GB, en-US; q=0.9, en; q=0.8",
    "Sec-WebSocket-Key": "kbGMvi1NfaJCr62GcVqyrA==",
    "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits"
};

// Initialize WebSocket
const ws = new WebSocket(serverUrl, {
    //headers: customHeaders
    headers: {
        "Origin": "https://web.sensibull.com"
    }
});

// Data Structures to Store Initial Greeks
const initialGreeks = {
    calls: {}, // { strike: { vega: Number, theta: Number } }
    puts: {}   // { strike: { vega: Number, theta: Number } }
};

// Flags and Time Configuration
let initialGreeksCaptured = false;
const MARKET_OPEN_TIME = moment().hour(9).minute(15).second(0).millisecond(0);

// Cumulative Differences
let cumulativeDifferences = {
    calls: { vega: 0, theta: 0 },
    puts: { vega: 0, theta: 0 }
};

// Function to Capture Initial Greeks
function captureInitialGreeks(optionData) {
    for (const strike in optionData) {
        const strikeData = optionData[strike];

        // Capture Calls (CE)
        if (strikeData.CE && strikeData.CE.greeks) {
            initialGreeks.calls[strike] = {
                vega: strikeData.CE.greeks.vega || 0,
                theta: strikeData.CE.greeks.theta || 0
            };
        }

        // Capture Puts (PE)
        if (strikeData.PE && strikeData.PE.greeks) {
            initialGreeks.puts[strike] = {
                vega: strikeData.PE.greeks.vega || 0,
                theta: strikeData.PE.greeks.theta || 0
            };
        }
    }
    console.log('Initial Greeks captured at market open.');
}

// Function to Calculate and Accumulate Differences
function calculateAndAccumulateDifferences(optionData) {
    // Reset cumulative differences
    cumulativeDifferences = {
        calls: { vega: 0, theta: 0 },
        puts: { vega: 0, theta: 0 }
    };

    for (const strike in optionData) {
        const strikeData = optionData[strike];

        // Calculate for Calls (CE)
        if (strikeData.CE && strikeData.CE.greeks && initialGreeks.calls[strike]) {
            const currentVega = strikeData.CE.greeks.vega || 0;
            const currentTheta = strikeData.CE.greeks.theta || 0;
            const vegaDiff = currentVega - initialGreeks.calls[strike].vega;
            const thetaDiff = currentTheta - initialGreeks.calls[strike].theta;

            cumulativeDifferences.calls.vega += vegaDiff;
            cumulativeDifferences.calls.theta += thetaDiff;
        }

        // Calculate for Puts (PE)
        if (strikeData.PE && strikeData.PE.greeks && initialGreeks.puts[strike]) {
            const currentVega = strikeData.PE.greeks.vega || 0;
            const currentTheta = strikeData.PE.greeks.theta || 0;
            const vegaDiff = currentVega - initialGreeks.puts[strike].vega;
            const thetaDiff = currentTheta - initialGreeks.puts[strike].theta;

            cumulativeDifferences.puts.vega += vegaDiff;
            cumulativeDifferences.puts.theta += thetaDiff;
        }
    }
}

// Function to Display the Table
function displayTable() {
    console.clear();
    console.log('-----------------------');
    console.log('Instrument: NIFTY (256265)');
    console.log('Market Open Time: 9:15 AM');
    console.log('Current Time:', moment().format('HH:mm:ss'));
    console.log('-----------------------');

    const tableData = [
        {
            Type: 'Call',
            Vega: cumulativeDifferences.calls.vega.toFixed(2),
            Theta: cumulativeDifferences.calls.theta.toFixed(2)
        },
        {
            Type: 'Put',
            Vega: cumulativeDifferences.puts.vega.toFixed(2),
            Theta: cumulativeDifferences.puts.theta.toFixed(2)
        }
    ];

    console.table(tableData);
}

// Function to Process Option Data
function processOptionData(optionData) {
    const currentTime = moment();

    // Check if it's time to capture initial Greeks
    if (!initialGreeksCaptured && currentTime.isSameOrAfter(MARKET_OPEN_TIME)) {
        captureInitialGreeks(optionData);
        initialGreeksCaptured = true;
    }

    // If initial Greeks are captured, calculate differences
    if (initialGreeksCaptured) {
        calculateAndAccumulateDifferences(optionData);
        displayTable();
    }
}

// WebSocket Event Handlers
ws.on('open', () => {
    const message = {
        "msgCommand": "subscribe",
        "dataSource": "option-chain",
        "brokerId": 1,
        "tokens": [], // Subscribing to NIFTY
        "underlyingExpiry": [
            {
                "underlying": 256265,
                "expiry": "2024-10-10"
            }
        ],
        "uniqueId": ""
    };
    ws.send(JSON.stringify(message));
    console.log("Connected to WebSocket and subscribed to option chain data.");
});

ws.on("message", (data) => {
    // Decode the incoming data
    let decodedData;
    try {
        decodedData = convert.decodeData(data); // Ensure this handles decompression if needed
    } catch (error) {
        console.error("Error decoding data:", error);
        return;
    }

    // Log the raw payload for debugging (optional, can be removed in production)
    // console.log("Received payload:", JSON.stringify(decodedData, null, 2));

    // Navigate to the 'chain' data
    const chainData = decodedData?.payload?.data?.['256265']?.['2024-10-10']?.chain;

    if (chainData && typeof chainData === 'object') {
        processOptionData(chainData);
    } else {
        console.log("Received message does not contain valid chain data.");
    }
});

ws.on('close', () => {
    console.log('WebSocket connection closed.');
});

ws.on('error', (error) => {
    console.error(`WebSocket error: ${error.message}`, error);
});
