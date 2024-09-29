const WebSocket = require('ws');
const fs = require('fs');
const output_dir = 'scrapped_data'
var dir = `./${output_dir}`;
const zlib = require('zlib');
const convert = require('./convert')

// const lib = require('./lib.js');

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
                "expiry": "2024-10-03"
            }
        ],
        "uniqueId": ""
    }
    msg = JSON.stringify(message)
    ws.send(msg)
    console.log("connected");
})

ws.on("message", (data) => {
    console.log("🚀 ~ ws.on ~ data:", data)
    const buffer = new Buffer.from(data)
    const bufferObj = buffer.toJSON()
    console.log("🚀 ~ ws.on ~ bufferObj:", bufferObj)
    const bufferarr = Buffer.from(bufferObj.data)
    const t = new Uint8Array(data),
        i = t[0];
    let _payload = convert.decodeData(data)
    console.log(JSON.stringify(_payload, null, 2));


})

ws.on('close', () => {
    console.log('Connection closed');
});

ws.on('error', (error) => {
    console.error(`WebSocket error: ${error.message} ${error}`);
});