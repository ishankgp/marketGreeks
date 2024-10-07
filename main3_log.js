const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const output_dir = 'scrapped_data';
const zlib = require('zlib');
const convert = require('./convert');

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
    console.log("connected");
});

ws.on("message", (data) => {
    console.log("Received data from WebSocket");
    
    // Decode the received data
    let _payload = convert.decodeData(data);
    console.log(JSON.stringify(_payload, null, 2));
    
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
});

ws.on('close', () => {
    console.log('Connection closed');
});

ws.on('error', (error) => {
    console.error(`WebSocket error: ${error.message} ${error}`);
});