const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const output_dir = 'scrapped_data';
const zlib = require('zlib');
const convert = require('./convert');

// Additional modules for table display
const Table = require('cli-table3'); // For dynamic table display in console

const serverUrl = 'wss://wsrelay.sensibull.com/broker/1?consumerType=platform_no_plan';
const customHeaders = {
    "Connection": "upgrade",
    "Upgrade": "websocket",
    "Sec-WebSocket-Accept": "CqbDPpldnDoub1dhmTY9tD+JRDs=",
    "Host": "wsrelay.sensibull.com",
    "Connection": "Upgrade",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "User-Agent": "Mozilla/5.0(Macintosh; Intel Mac OS X 10_15_7) AppleWebKit / 537.36(KHTML, like Gecko) Chrome / 129.0.0.0 Safari / 537.36",
    "Upgrade": "websocket",
    "Origin": "https://web.sensibull.com",
    "Sec-WebSocket-Version": 13,
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-GB, en-US; q=0.9, en; q=0.8",
    "Sec-WebSocket-Key": "kbGMvi1NfaJCr62GcVqyrA==",
    "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits"
};

// Create output directory if it does not exist
if (!fs.existsSync(output_dir)) {
    fs.mkdirSync(output_dir);
}

const ws = new WebSocket(serverUrl, {
    headers: customHeaders
});

// Data structures to hold cumulative values
let instrumentsData = {}; // Stores data for each instrument
let initializedAt915 = false; // Flag to check if 9:15 AM data has been initialized

// Function to check if it's 9:15 AM
function isTime915() {
    const now = new Date();
    return now.getHours() === 9 && now.getMinutes() === 15;
}

// Function to classify strikes
function classifyStrike(strikePrice, spotPrice, optionType) {
    if (Math.abs(strikePrice - spotPrice) <= 50) {
        return 'ATM';
    }
    if (optionType === 'CE') {
        return strikePrice > spotPrice ? 'OTM' : 'ITM';
    } else if (optionType === 'PE') {
        return strikePrice < spotPrice ? 'OTM' : 'ITM';
    }
    return 'UNKNOWN';
}

ws.on('open', () => {
    let message = {
        "msgCommand": "subscribe",
        "dataSource": "option-chain",
        "brokerId": 1,
        "tokens": [],
        "underlyingExpiry": [
            {
                "underlying": 256265,
                "expiry": "2024-10-10"
            }
        ],
        "uniqueId": ""
    };
    const msg = JSON.stringify(message);
    ws.send(msg);
    console.log("Connected to WebSocket server.");
});

ws.on("message", (data) => {
    console.log("Received data from WebSocket");

    // Decode the received data
    let _payload = convert.decodeData(data);
    // console.log(JSON.stringify(_payload, null, 2));

    // Store the received data into a file for further analysis
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(output_dir, `websocket_output_${timestamp}.json`);
    fs.writeFile(filePath, JSON.stringify(_payload, null, 2), (err) => {
        if (err) {
            console.error('Error writing to file', err);
        } else {
            console.log('Data successfully saved to', filePath);
        }
    });

    // Begin processing for cumulative Vega and Theta
    processData(_payload);
});

ws.on('close', () => {
    console.log('Connection closed');
});

ws.on('error', (error) => {
    console.error(`WebSocket error: ${error.message} ${error}`);
});

// Function to process the data and update cumulative values
function processData(payload) {
    const data = payload.payload?.data;
    if (!data) {
        console.error('No data in payload.');
        return;
    }

    for (let token in data) {
        for (let expiry in data[token]) {
            const instrumentToken = token;
            const instrumentName = 'Nifty'; // Assuming Nifty for now
            const expiryDate = expiry;
            const instrumentKey = `${instrumentToken}_${expiryDate}`;

            // Initialize data structures if not present
            if (!instrumentsData[instrumentKey]) {
                instrumentsData[instrumentKey] = {
                    instrumentName: instrumentName,
                    token: instrumentToken,
                    expiry: expiryDate,
                    calls: {
                        vega_915: 0,
                        theta_915: 0,
                        vega_current: 0,
                        theta_current: 0,
                        vega_diff: 0,
                        theta_diff: 0
                    },
                    puts: {
                        vega_915: 0,
                        theta_915: 0,
                        vega_current: 0,
                        theta_current: 0,
                        vega_diff: 0,
                        theta_diff: 0
                    },
                    atm_strike: 0,
                    spot_price: 0
                };
            }

            const instrumentData = instrumentsData[instrumentKey];
            const chainData = data[token][expiry]['chain'];
            const atmStrike = data[token][expiry]['atm_strike'];

            // Update spot price and atm_strike
            instrumentData.atm_strike = atmStrike;
            instrumentData.spot_price = atmStrike; // Assuming spot price ≈ atm_strike

            // Initialize cumulative sums
            let callsVegaSum = 0;
            let callsThetaSum = 0;
            let putsVegaSum = 0;
            let putsThetaSum = 0;

            // Process each strike
            for (let strike in chainData) {
                const strikePrice = parseFloat(strike);

                // Classify strike for Calls
                const callClassification = classifyStrike(strikePrice, instrumentData.spot_price, 'CE');
                if (callClassification === 'ATM' || callClassification === 'OTM') {
                    const callData = chainData[strike]['CE'];
                    if (callData && callData.greeks) {
                        const vega = callData.greeks.vega || 0;
                        const theta = callData.greeks.theta || 0;
                        callsVegaSum += vega;
                        callsThetaSum += theta;
                    }
                }

                // Classify strike for Puts
                const putClassification = classifyStrike(strikePrice, instrumentData.spot_price, 'PE');
                if (putClassification === 'ATM' || putClassification === 'OTM') {
                    const putData = chainData[strike]['PE'];
                    if (putData && putData.greeks) {
                        const vega = putData.greeks.vega || 0;
                        const theta = putData.greeks.theta || 0;
                        putsVegaSum += vega;
                        putsThetaSum += theta;
                    }
                }
            }

            // Initialize 9:15 AM values if not already done
            if (!initializedAt915 && isTime915()) {
                instrumentData.calls.vega_915 = callsVegaSum;
                instrumentData.calls.theta_915 = callsThetaSum;
                instrumentData.puts.vega_915 = putsVegaSum;
                instrumentData.puts.theta_915 = putsThetaSum;
                initializedAt915 = true;
            } else if (!initializedAt915 && !isTime915()) {
                // If it's not 9:15 AM and values are not initialized, set to zero
                instrumentData.calls.vega_915 = instrumentData.calls.vega_915 || 0;
                instrumentData.calls.theta_915 = instrumentData.calls.theta_915 || 0;
                instrumentData.puts.vega_915 = instrumentData.puts.vega_915 || 0;
                instrumentData.puts.theta_915 = instrumentData.puts.theta_915 || 0;
            }

            // Update current values and differences
            instrumentData.calls.vega_current = callsVegaSum;
            instrumentData.calls.theta_current = callsThetaSum;
            instrumentData.calls.vega_diff = callsVegaSum - instrumentData.calls.vega_915;
            instrumentData.calls.theta_diff = callsThetaSum - instrumentData.calls.theta_915;

            instrumentData.puts.vega_current = putsVegaSum;
            instrumentData.puts.theta_current = putsThetaSum;
            instrumentData.puts.vega_diff = putsVegaSum - instrumentData.puts.vega_915;
            instrumentData.puts.theta_diff = putsThetaSum - instrumentData.puts.theta_915;

            // Display the dynamic table
            displayTable(instrumentData);
        }
    }
}

// Function to display the dynamic table
function displayTable(instrumentData) {
    const table = new Table({
        head: ['Instrument', 'Option Type', 'Vega @9:15 AM', 'Vega @Now', 'Vega Δ', 'Theta @9:15 AM', 'Theta @Now', 'Theta Δ'],
        colWidths: [15, 12, 15, 15, 10, 15, 15, 10]
    });

    // Add Calls data
    table.push(
        [
            instrumentData.instrumentName,
            'Calls',
            instrumentData.calls.vega_915.toFixed(2),
            instrumentData.calls.vega_current.toFixed(2),
            instrumentData.calls.vega_diff.toFixed(2),
            instrumentData.calls.theta_915.toFixed(2),
            instrumentData.calls.theta_current.toFixed(2),
            instrumentData.calls.theta_diff.toFixed(2)
        ],
        // Add Puts data
        [
            instrumentData.instrumentName,
            'Puts',
            instrumentData.puts.vega_915.toFixed(2),
            instrumentData.puts.vega_current.toFixed(2),
            instrumentData.puts.vega_diff.toFixed(2),
            instrumentData.puts.theta_915.toFixed(2),
            instrumentData.puts.theta_current.toFixed(2),
            instrumentData.puts.theta_diff.toFixed(2)
        ]
    );

    console.log(table.toString());
}
