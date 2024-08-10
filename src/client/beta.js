const net = require('net');
const fs = require('fs');
const client = new net.Socket();

const PORT = 3000;
const PACKET_SIZE = 17; // 4 (symbol) + 1 (indicator) + 4 (quantity) + 4 (price) + 4 (sequence)

let packets = [];

// Function to convert a buffer to an object
function parsePacket(buffer) {
    return {
        symbol: buffer.toString('ascii', 0, 4).trim(),
        buySellIndicator: buffer.toString('ascii', 4, 5),
        quantity: buffer.readInt32BE(5),
        price: buffer.readInt32BE(9),
        sequence: buffer.readInt32BE(13),
    };
}

// Function to request all packets
function requestAllPackets() {
    const client = net.createConnection({  port: PORT }, () => {
        console.log('connect to server')
        // const requestBuffer = Buffer.alloc(1);
        // console.log(requestBuffer)
        // requestBuffer.writeInt8(1); // Call Type 1: Stream All Packets
        // client.write(requestBuffer, () => {
        //     console.log('Data sent:', requestBuffer);
        //   });
        const buffer = Buffer.alloc(2);
        buffer.writeInt8(1, 0); // callType = 1
        buffer.writeInt8(0, 1); // sequence number = 0 (or any other relevant value)
        client.write(buffer);

    });
    

    client.on('data', (data) => {
        console.log(data)
        for (let i = 0; i < data.length; i += PACKET_SIZE) {
            const packetBuffer = data.slice(i, i + PACKET_SIZE);
            packets.push(parsePacket(packetBuffer));
        }
    });

    client.on('end', () => {
        console.log('data received')
        ensureNoMissingSequences();
    });

    client.on('error', (err) => {
        console.error('Error:', err);
    });
}

// Function to request a specific packet by sequence number
function requestMissingPacket(sequence) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ port: PORT }, () => {
            const requestBuffer = Buffer.alloc(2);
            requestBuffer.writeUInt8(2, 0); // Call Type 2: Resend Packet
            requestBuffer.writeUInt8(sequence, 1);
            client.write(requestBuffer);
        });

        client.on('data', (data) => {
            const packet = parsePacket(data);
            packets.push(packet);
            resolve();
        });

        client.on('end', () => {
            client.end();
        });

        client.on('error', (err) => {
            reject(err);
        });
    });
}

// Function to ensure no sequences are missing
async function ensureNoMissingSequences() {
    packets.sort((a, b) => a.sequence - b.sequence);

    let missingSequences = [];
    for (let i = 0; i < packets.length - 1; i++) {
        if (packets[i].sequence + 1 !== packets[i + 1].sequence) {
            for (let seq = packets[i].sequence + 1; seq < packets[i + 1].sequence; seq++) {
                missingSequences.push(seq);
            }
        }
    }

    for (const seq of missingSequences) {
        await requestMissingPacket(seq);
    }

    packets.sort((a, b) => a.sequence - b.sequence);

    savePacketsToFile();
}

// Function to save packets to a JSON file
function savePacketsToFile() {
    fs.writeFileSync('packets.json', JSON.stringify(packets, null, 2));
    console.log('Packets saved to packets.json');
}

// Start the process
requestAllPackets();
