// Import required modules
const WebSocket = require('ws');
const zlib = require('zlib');
const moment = require('moment'); // Ensure moment.js is installed: npm install moment
const convert = require('./convert'); // Make sure this module correctly decodes your data

// Configuration: WebSocket server URL and custom headers
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

// Initialize WebSocket connection to server
const ws = new WebSocket(serverUrl, {
    headers: {
        "Origin": "https://web.sensibull.com"
    }
});

// Data Structures to store initial Greeks for both Calls (CE) and Puts (PE)
const initialGreeks = {
    nifty: {
        calls: {},
        puts: {}
    },
    bankNifty: {
        calls: {},
        puts: {}
    }
};

// Flags and Time Configuration for market open time
let hasCapturedInitialGreeks = {
    nifty: false,
    bankNifty: false
};
const MARKET_OPEN_TIME = moment().hour(9).minute(15).second(0).millisecond(0);

// Cumulative differences for calls and puts
let cumulativeDifferences = {
    nifty: {
        calls: { vega: 0, theta: 0 },
        puts: { vega: 0, theta: 0 }
    },
    bankNifty: {
        calls: { vega: 0, theta: 0 },
        puts: { vega: 0, theta: 0 }
    }
};

// Function to capture initial Greeks at market open
function captureInitialGreeks(optionData, symbol) {
    for (const strike in optionData) {
        const strikeData = optionData[strike];

        // Capture Calls (CE)
        if (strikeData.CE && strikeData.CE.greeks) {
            initialGreeks[symbol].calls[strike] = {
                vega: strikeData.CE.greeks.vega || 0,
                theta: strikeData.CE.greeks.theta || 0
            };
        }

        // Capture Puts (PE)
        if (strikeData.PE && strikeData.PE.greeks) {
            initialGreeks[symbol].puts[strike] = {
                vega: strikeData.PE.greeks.vega || 0,
                theta: strikeData.PE.greeks.theta || 0
            };
        }
    }
    console.log(`Initial Greeks captured at market open for ${symbol}.`);
}

// Function to calculate differences between current and initial Greeks and accumulate them
function calculateAndAccumulateDifferences(optionData, symbol) {
    for (const strike in optionData) {
        const strikeData = optionData[strike];

        // Calculate differences for Calls (CE)
        if (strikeData.CE && strikeData.CE.greeks && initialGreeks[symbol].calls[strike]) {
            const currentVega = strikeData.CE.greeks.vega || 0;
            const currentTheta = strikeData.CE.greeks.theta || 0;
            const vegaDiff = currentVega - initialGreeks[symbol].calls[strike].vega;
            const thetaDiff = currentTheta - initialGreeks[symbol].calls[strike].theta;

            cumulativeDifferences[symbol].calls.vega += vegaDiff;
            cumulativeDifferences[symbol].calls.theta += thetaDiff;
        }

        // Calculate differences for Puts (PE)
        if (strikeData.PE && strikeData.PE.greeks && initialGreeks[symbol].puts[strike]) {
            const currentVega = strikeData.PE.greeks.vega || 0;
            const currentTheta = strikeData.PE.greeks.theta || 0;
            const vegaDiff = currentVega - initialGreeks[symbol].puts[strike].vega;
            const thetaDiff = currentTheta - initialGreeks[symbol].puts[strike].theta;

            cumulativeDifferences[symbol].puts.vega += vegaDiff;
            cumulativeDifferences[symbol].puts.theta += thetaDiff;
        }
    }
}

// Function to display a summary table with cumulative differences
function displayTable() {
    console.clear();
    console.log('-----------------------');
    console.log('Instrument: NIFTY (256265), BANK NIFTY (260105)');
    console.log('Market Open Time: 9:15 AM');
    console.log('Current Time:', moment().format('HH:mm:ss'));
    console.log('-----------------------');

    const tableData = [
        {
            Type: 'Nifty Call',
            Vega: cumulativeDifferences.nifty.calls.vega !== 0 ? cumulativeDifferences.nifty.calls.vega.toFixed(2) : 'No Data',
            Theta: cumulativeDifferences.nifty.calls.theta !== 0 ? cumulativeDifferences.nifty.calls.theta.toFixed(2) : 'No Data'
        },
        {
            Type: 'Nifty Put',
            Vega: cumulativeDifferences.nifty.puts.vega !== 0 ? cumulativeDifferences.nifty.puts.vega.toFixed(2) : 'No Data',
            Theta: cumulativeDifferences.nifty.puts.theta !== 0 ? cumulativeDifferences.nifty.puts.theta.toFixed(2) : 'No Data'
        },
        {
            Type: 'Bank Nifty Call',
            Vega: cumulativeDifferences.bankNifty.calls.vega !== 0 ? cumulativeDifferences.bankNifty.calls.vega.toFixed(2) : 'No Data',
            Theta: cumulativeDifferences.bankNifty.calls.theta !== 0 ? cumulativeDifferences.bankNifty.calls.theta.toFixed(2) : 'No Data'
        },
        {
            Type: 'Bank Nifty Put',
            Vega: cumulativeDifferences.bankNifty.puts.vega !== 0 ? cumulativeDifferences.bankNifty.puts.vega.toFixed(2) : 'No Data',
            Theta: cumulativeDifferences.bankNifty.puts.theta !== 0 ? cumulativeDifferences.bankNifty.puts.theta.toFixed(2) : 'No Data'
        }
    ];

    console.table(tableData);
}

// Function to process option data received from WebSocket
function processOptionData(optionData, symbol) {
    const currentTime = moment();

    // Capture initial Greeks at market open
    if (!hasCapturedInitialGreeks[symbol] && currentTime.isSameOrAfter(MARKET_OPEN_TIME)) {
        captureInitialGreeks(optionData, symbol);
        hasCapturedInitialGreeks[symbol] = true;
    }

    // Calculate and accumulate differences if initial Greeks are captured
    if (hasCapturedInitialGreeks[symbol]) {
        calculateAndAccumulateDifferences(optionData, symbol);
        displayTable();
    }
}

// WebSocket event handlers
ws.on('open', () => {
    // Subscription message to WebSocket for option chain data
    const message = {
        "msgCommand": "subscribe",
        "dataSource": "option-chain",
        "brokerId": 1,
        "tokens": [], // Subscribing to NIFTY and BANK NIFTY
        "underlyingExpiry": [
            {
                "underlying": 256265,
                "expiry": "2024-10-10"
            },
            {
                "underlying": 260105,
                "expiry": "2024-10-09"
            }
        ],
        "uniqueId": ""
    };
    ws.send(JSON.stringify(message));
    console.log("Connected to WebSocket and subscribed to option chain data.");
});

// Handle incoming WebSocket messages
ws.on("message", (data) => {
    // Decode the incoming data
    let decodedData;
    try {
        decodedData = convert.decodeData(data); // Ensure this handles decompression if needed
    } catch (error) {
        console.error("Error decoding data:", error);
        return;
    }

    // Navigate to the 'chain' data for NIFTY and BANK NIFTY
    const niftyChainData = decodedData?.payload?.data?.['256265']?.['2024-10-10']?.chain;
    const bankNiftyChainData = decodedData?.payload?.data?.['260105']?.['2024-10-09']?.chain;

    if (niftyChainData && typeof niftyChainData === 'object') {
        processOptionData(niftyChainData, 'nifty');
    } else {
        console.log("Received message does not contain valid NIFTY chain data.");
    }

    if (bankNiftyChainData && typeof bankNiftyChainData === 'object') {
        processOptionData(bankNiftyChainData, 'bankNifty');
    } else {
        console.log("Received message does not contain valid BANK NIFTY chain data.");
    }
});

// Handle WebSocket close event
ws.on('close', () => {
    console.log('WebSocket connection closed.');
});

// Handle WebSocket error event
ws.on('error', (error) => {
    console.error(`WebSocket error: ${error.message}`, error);
});