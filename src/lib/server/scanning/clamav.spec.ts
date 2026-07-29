import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { parseResponse, scanWithClamAv } from './clamav';

/**
 * A stand-in for clamd.
 *
 * The daemon is a deployment dependency, but the wire format is ours to get
 * right, and it is easy to get subtly wrong — a missing terminator or a
 * mis-sized header hangs rather than failing. This speaks just enough of the
 * protocol to prove we speak it too.
 */
function fakeClamd(handler: (received: Buffer, socket: net.Socket) => void): Promise<net.Server> {
	const server = net.createServer((socket) => {
		const chunks: Buffer[] = [];
		socket.on('data', (chunk) => {
			chunks.push(chunk);
			handler(Buffer.concat(chunks), socket);
		});
	});

	return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function portOf(server: net.Server): number {
	const address = server.address();
	if (address === null || typeof address === 'string') throw new Error('No port.');
	return address.port;
}

/** Whether the whole INSTREAM request has arrived: command, chunks, terminator. */
function isComplete(received: Buffer): boolean {
	if (!received.subarray(0, 10).toString().startsWith('zINSTREAM\0')) return false;

	let offset = 10;
	while (offset + 4 <= received.length) {
		const length = received.readUInt32BE(offset);
		if (length === 0) return true;
		offset += 4 + length;
	}
	return false;
}

describe('reading a clamd reply', () => {
	it('recognises the three verdicts', () => {
		expect(parseResponse('stream: OK\0')).toBe('clean');
		expect(parseResponse('stream: Eicar-Test-Signature FOUND\0')).toBe('infected');
		expect(parseResponse('INSTREAM size limit exceeded. ERROR\0')).toBe('failed');
	});

	it('treats anything it does not recognise as failed', () => {
		// This is the whole security boundary of the driver. A parser that falls
		// through to "clean" turns a daemon saying something unexpected into a
		// silent all-clear.
		expect(parseResponse('')).toBe('failed');
		expect(parseResponse('something else entirely\0')).toBe('failed');
		expect(parseResponse('stream: ')).toBe('failed');
	});

	it('prefers a signature over an OK appearing in the same reply', () => {
		// Order matters: a signature name can contain almost anything, and a reply
		// mentioning both must never be read as clean.
		expect(parseResponse('stream: Win.Test.OK-Signature FOUND\0')).toBe('infected');
	});
});

describe('talking to clamd', () => {
	const servers: net.Server[] = [];

	afterEach(async () => {
		await Promise.all(servers.splice(0).map((server) => new Promise((r) => server.close(r))));
	});

	async function serverThatReplies(reply: string): Promise<number> {
		const server = await fakeClamd((received, socket) => {
			if (isComplete(received)) socket.end(reply);
		});
		servers.push(server);
		return portOf(server);
	}

	it('sends a well-formed request and reads a clean verdict', async () => {
		const port = await serverThatReplies('stream: OK\0');

		const verdict = await scanWithClamAv(Buffer.from('%PDF-1.4\n%%EOF'), {
			host: '127.0.0.1',
			port,
			timeoutMs: 5000
		});

		// The fake only answers once it has seen the command, a sized chunk and the
		// zero-length terminator, so a verdict at all means the format was right.
		expect(verdict).toBe('clean');
	});

	it('reports an infected file', async () => {
		const port = await serverThatReplies('stream: Eicar-Test-Signature FOUND\0');

		const verdict = await scanWithClamAv(Buffer.from('anything'), {
			host: '127.0.0.1',
			port,
			timeoutMs: 5000
		});

		expect(verdict).toBe('infected');
	});

	it('chunks a payload larger than one frame', async () => {
		const port = await serverThatReplies('stream: OK\0');

		// Over the 64KB chunk size, so the loop runs more than once and a bug in the
		// offset arithmetic shows up as a hang rather than passing by accident.
		const large = Buffer.alloc(200_000, 0x41);

		const verdict = await scanWithClamAv(large, { host: '127.0.0.1', port, timeoutMs: 5000 });
		expect(verdict).toBe('clean');
	});

	it('still completes the handshake for an empty file', async () => {
		const port = await serverThatReplies('stream: OK\0');

		// Short-circuiting on zero bytes would mean an empty upload was never
		// actually offered to the scanner.
		const verdict = await scanWithClamAv(Buffer.alloc(0), {
			host: '127.0.0.1',
			port,
			timeoutMs: 5000
		});

		expect(verdict).toBe('clean');
	});

	it('fails rather than passes when nothing is listening', async () => {
		// A refused connection is the shape of a daemon that is down. It must never
		// be mistaken for a clean bill of health.
		const verdict = await scanWithClamAv(Buffer.from('x'), {
			host: '127.0.0.1',
			// Port 1 is privileged and unused; nothing will answer.
			port: 1,
			timeoutMs: 2000
		});

		expect(verdict).toBe('failed');
	});

	it('fails when the daemon accepts the connection and says nothing', async () => {
		const server = await fakeClamd(() => {
			// Deliberately silent. An idle-timeout alone would never fire here on a
			// connection that stays open, which is why the driver keeps its own timer.
		});
		servers.push(server);

		const verdict = await scanWithClamAv(Buffer.from('x'), {
			host: '127.0.0.1',
			port: portOf(server),
			timeoutMs: 300
		});

		expect(verdict).toBe('failed');
	});

	it('fails on a reply that is cut off mid-sentence', async () => {
		const server = await fakeClamd((received, socket) => {
			// No NUL terminator, then the socket drops. Whatever arrived is partial,
			// and a partial reply is not a clean one.
			if (isComplete(received)) socket.destroy();
		});
		servers.push(server);

		const verdict = await scanWithClamAv(Buffer.from('x'), {
			host: '127.0.0.1',
			port: portOf(server),
			timeoutMs: 2000
		});

		expect(verdict).toBe('failed');
	});
});
