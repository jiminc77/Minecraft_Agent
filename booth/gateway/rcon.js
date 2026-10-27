// Minimal Source RCON client for the local Paper server.
import net from 'node:net';

export class Rcon {
    constructor({ host = '127.0.0.1', port, password }) {
        Object.assign(this, { host, port, password });
        this.nextId = 1;
        this.pending = new Map();
        this.buffer = Buffer.alloc(0);
        this.queue = Promise.resolve();
    }

    async connect() {
        this.socket = net.createConnection({ host: this.host, port: this.port });
        this.socket.on('data', chunk => this.#onData(chunk));
        this.socket.on('close', () => {
            this.socket = null;
            for (const { reject } of this.pending.values()) reject(new Error('RCON closed'));
            this.pending.clear();
        });
        await new Promise((resolve, reject) => {
            this.socket.once('connect', resolve);
            this.socket.once('error', reject);
        });
        const ok = await this.#send(3, this.password);
        if (ok.id === -1) throw new Error('RCON authentication failed');
    }

    command(text) {
        const run = async () => {
            if (!this.socket) await this.connect();
            return (await this.#send(2, text)).body;
        };
        this.queue = this.queue.then(run, run);
        return this.queue;
    }

    #send(type, body) {
        const id = this.nextId++;
        const payload = Buffer.from(body, 'utf8');
        const packet = Buffer.alloc(14 + payload.length);
        packet.writeInt32LE(10 + payload.length, 0);
        packet.writeInt32LE(id, 4);
        packet.writeInt32LE(type, 8);
        payload.copy(packet, 12);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`RCON timeout: ${body}`));
            }, 10000);
            this.pending.set(id, {
                resolve: value => { clearTimeout(timer); resolve(value); },
                reject: error => { clearTimeout(timer); reject(error); },
            });
            this.socket.write(packet);
        });
    }

    #onData(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length >= 4) {
            const length = this.buffer.readInt32LE(0);
            if (this.buffer.length < length + 4) break;
            const id = this.buffer.readInt32LE(4);
            const body = this.buffer.toString('utf8', 12, length + 2);
            this.buffer = this.buffer.subarray(length + 4);
            // Auth failure answers with id -1 for the pending auth request.
            const key = id === -1 ? [...this.pending.keys()][0] : id;
            const entry = this.pending.get(key);
            if (entry) {
                this.pending.delete(key);
                entry.resolve({ id, body });
            }
        }
    }
}
