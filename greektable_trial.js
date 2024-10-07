const WebSocket = require('ws');
const zlib = require('zlib');
const moment = require('moment'); // Ensure moment.js is installed: npm install moment
const convert = require('./convert'); // Make sure this module correctly decodes your data
const fs = require('fs');
const path = require('path');

// Create folder for scrapped data if it doesn't exist
const scrappedDataFolder = path.join(__dirname, 'scrapped_data');
if (!fs.existsSync(scrappedDataFolder)) {
    fs.mkdirSync(scrappedDataFolder);
}

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

// Initialize WebSocket for NIFTY
const wsNifty = new WebSocket(serverUrl, {
    headers: {
        "Origin": "https://web.sensibull.com"
    }
});

// Initialize WebSocket for Bank-NIFTY
const wsBankNifty = new WebSocket(serverUrl, {
    headers: {
        "Origin": "https://web.sensibull.com"
    }
});

// Data Structures to Store Initial Greeks
const initialGreeks = {
    nifty: {
        calls: {}, // { strike: { vega: Number, theta: Number } }
        puts: {}   // { strike: { vega: Number, theta: Number } }
    },
    bankNifty: {
        calls: {}, // { strike: { vega: Number, theta: Number } }
        puts: {}   // { strike: { vega: Number, theta: Number } }
    }
};

// Flags and Time Configuration
let initialGreeksCaptured = {
    nifty: false,
    bankNifty: false
};
const MARKET_OPEN_TIME = moment().hour(9).minute(15).second(0).millisecond(0);

// Cumulative Differences
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

// Function to Capture Initial Greeks
function captureInitialGreeks(optionData, symbol) {
    console.log(`Capturing initial Greeks for ${symbol}...`);
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

// Function to Calculate and Accumulate Differences
function calculateAndAccumulateDifferences(optionData, symbol) {
    console.log(`Calculating and accumulating differences for ${symbol}...`);
    // Reset cumulative differences
    cumulativeDifferences[symbol] = {
        calls: { vega: 0, theta: 0 },
        puts: { vega: 0, theta: 0 }
    };

    for (const strike in optionData) {
        const strikeData = optionData[strike];

        // Calculate for Calls (CE)
        if (strikeData.CE && strikeData.CE.greeks && initialGreeks[symbol].calls[strike]) {
            const currentVega = strikeData.CE.greeks.vega || 0;
            const currentTheta = strikeData.CE.greeks.theta || 0;
            const vegaDiff = currentVega - initialGreeks[symbol].calls[strike].vega;
            const thetaDiff = currentTheta - initialGreeks[symbol].calls[strike].theta;

            cumulativeDifferences[symbol].calls.vega += vegaDiff;
            cumulativeDifferences[symbol].calls.theta += thetaDiff;
        }

        // Calculate for Puts (PE)
        if (strikeData.PE && strikeData.PE.greeks && initialGreeks[symbol].puts[strike]) {
            const currentVega = strikeData.PE.greeks.vega || 0;
            const currentTheta = strikeData.PE.greeks.theta || 0;
            const vegaDiff = currentVega - initialGreeks[symbol].puts[strike].vega;
            const thetaDiff = currentTheta - initialGreeks[symbol].puts[strike].theta;

            cumulativeDifferences[symbol].puts.vega += vegaDiff;
            cumulativeDifferences[symbol].puts.theta += thetaDiff;
        }
    }
    console.log(`Cumulative differences for ${symbol}:`, cumulativeDifferences[symbol]);

    // Write cumulative differences to scrapped_data folder
    const filePath = path.join(scrappedDataFolder, `${symbol}_cumulative_differences.json`);
    fs.writeFileSync(filePath, JSON.stringify(cumulativeDifferences[symbol], null, 2));
}

// Function to Display the Table
function displayTable() {
    console.clear();
    console.log('-----------------------');
    console.log('Market Open Time: 9:15 AM');
    console.log('Current Time:', moment().format('HH:mm:ss'));
    console.log('-----------------------');

    const tableData = [
        {
            Instrument: 'NIFTY',
            Type: 'Call',
            Vega: cumulativeDifferences.nifty.calls.vega.toFixed(2),
            Theta: cumulativeDifferences.nifty.calls.theta.toFixed(2)
        },
        {
            Instrument: 'NIFTY',
            Type: 'Put',
            Vega: cumulativeDifferences.nifty.puts.vega.toFixed(2),
            Theta: cumulativeDifferences.nifty.puts.theta.toFixed(2)
        },
        {
            Instrument: 'Bank-NIFTY',
            Type: 'Call',
            Vega: cumulativeDifferences.bankNifty.calls.vega.toFixed(2),
            Theta: cumulativeDifferences.bankNifty.calls.theta.toFixed(2)
        },
        {
            Instrument: 'Bank-NIFTY',
            Type: 'Put',
            Vega: cumulativeDifferences.bankNifty.puts.vega.toFixed(2),
            Theta: cumulativeDifferences.bankNifty.puts.theta.toFixed(2)
        }
    ];

    console.table(tableData);
}

// Function to Process Option Data
function processOptionData(optionData, symbol) {
    console.log(`Processing option data for ${symbol}...`);
    const currentTime = moment();

    // Check if it's time to capture initial Greeks
    if (!initialGreeksCaptured[symbol] && currentTime.isSameOrAfter(MARKET_OPEN_TIME)) {
        console.log(`Capturing initial Greeks for ${symbol} at market open...`);
        captureInitialGreeks(optionData, symbol);
        initialGreeksCaptured[symbol] = true;
    }

    // If initial Greeks are captured, calculate differences
    if (initialGreeksCaptured[symbol]) {
        console.log(`Calculating differences for ${symbol}...`);
        calculateAndAccumulateDifferences(optionData, symbol);
        displayTable();
    }
}

// WebSocket Event Handlers for NIFTY
wsNifty.on('open', () => {
    console.log("WebSocket connection for NIFTY opened.");
    const message = {
        "msgCommand": "subscribe",
        "dataSource": "option-chain",
        "brokerId": 1,
        "tokens": [], // Subscribing to NIFTY
        "underlyingExpiry": [
            {
                "underlying": 256265, // NIFTY
                "expiry": "2024-10-10"
            }
        ],
        "uniqueId": ""
    };
    wsNifty.send(JSON.stringify(message));
    console.log("Connected to WebSocket and subscribed to NIFTY option chain data.");
});

wsNifty.on("message", (data) => {
    console.log("Received message for NIFTY.");
    // Decode the incoming data
    let decodedData;
    try {
        decodedData = convert.decodeData(data); // Ensure this handles decompression if needed
        console.log("Decoded data for NIFTY:", decodedData);
        // Write raw message data to scrapped_data folder with timestamp
        const timestamp = moment().format('YYYYMMDD_HHmmss_SSS');
        const filePath = path.join(scrappedDataFolder, `NIFTY_${timestamp}.json`);
        fs.writeFileSync(filePath, JSON.stringify(decodedData, null, 2));
    } catch (error) {
        console.error("Error decoding data for NIFTY:", error);
        return;
    }

    // Process NIFTY data
    const niftyChainData = decodedData?.payload?.data?.['256265']?.['2024-10-10']?.chain;
    if (niftyChainData && typeof niftyChainData === 'object') {
        console.log("Processing NIFTY chain data...");
        processOptionData(niftyChainData, 'nifty');
    } else {
        console.log("No valid chain data received for NIFTY.");
    }
});

wsNifty.on('close', () => {
    console.log('WebSocket connection for NIFTY closed.');
});

wsNifty.on('error', (error) => {
    console.error(`WebSocket error for NIFTY: ${error.message}`, error);
});

// WebSocket Event Handlers for Bank-NIFTY
wsBankNifty.on('open', () => {
    console.log("WebSocket connection for Bank-NIFTY opened.");
    const message = {
        "msgCommand": "subscribe",
        "dataSource": "option-chain",
        "brokerId": 1,
        "tokens": [], // Subscribing to Bank-NIFTY
        "underlyingExpiry": [
            {
                "underlying": 260105, // Bank-NIFTY
                "expiry": "2024-10-09"
            }
        ],
        "uniqueId": ""
    };
    wsBankNifty.send(JSON.stringify(message));
    console.log("Connected to WebSocket and subscribed to Bank-NIFTY option chain data.");
});

wsBankNifty.on("message", (data) => {
    console.log("Received message for Bank-NIFTY.");
    // Decode the incoming data
    let decodedData;
    try {
        decodedData = convert.decodeData(data); // Ensure this handles decompression if needed
        console.log("Decoded data for Bank-NIFTY:", decodedData);
        // Write raw message data to scrapped_data folder with timestamp
        const timestamp = moment().format('YYYYMMDD_HHmmss_SSS');
        const filePath = path.join(scrappedDataFolder, `BankNIFTY_${timestamp}.json`);
        fs.writeFileSync(filePath, JSON.stringify(decodedData, null, 2));
    } catch (error) {
        console.error("Error decoding data for Bank-NIFTY:", error);
        return;
    }

    // Process Bank-NIFTY data
    const bankNiftyChainData = decodedData?.payload?.data?.['260105']?.['2024-10-09']?.chain;
    if (bankNiftyChainData && typeof bankNiftyChainData === 'object') {
        console.log("Processing Bank-NIFTY chain data...");
        processOptionData(bankNiftyChainData, 'bankNifty');
    } else {
        console.log("No valid chain data received for Bank-NIFTY.");
    }
});

wsBankNifty.on('close', () => {
    console.log('WebSocket connection for Bank-NIFTY closed.');
});

wsBankNifty.on('error', (error) => {
    console.error(`WebSocket error for Bank-NIFTY: ${error.message}`, error);
});