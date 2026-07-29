import net from 'node:net';
import { CLAMAV_HOST, CLAMAV_PORT, CLAMAV_TIMEOUT_MS } from '$app/env/private';
import type { ScanVerdict } from './verdict';

/**
 * ClamAV over its INSTREAM command.
 *
 * INSTREAM rather than SCAN because SCAN takes a *path* the daemon must be able
 * to read — which means sharing a filesystem with it, and stops working the
 * moment storage moves to S3. Streaming the bytes over the socket keeps the
 * scanner a network dependency rather than a deployment topology.
 *
 * The wire format, since it is easy to get subtly wrong:
 *
 *   > zINSTREAM\0
 *   > <uint32be length><chunk>   (repeated)
 *   > <uint32be 0>               (terminator)
 *   < stream: OK\0
 *   < stream: <signature> FOUND\0
 *   < <message> ERROR\0
 *
 * The `z` prefix asks for NUL-terminated replies, which is what makes the end of
 * a response unambiguous — the newline-terminated variant is indistinguishable
 * from a reply that simply has not finished arriving.
 */

/** clamd's own default. Larger chunks risk StreamMaxLength on the daemon side. */
const CHUNK_BYTES = 64 * 1024;

export interface ClamAvOptions {
	host: string;
	port: number;
	timeoutMs: number;
}

/**
 * Read a verdict out of clamd's reply.
 *
 * Anything unrecognised is `failed`, never `clean`. This function is the whole
 * security boundary of the driver: a parser that falls through to "clean" turns
 * a daemon returning something unexpected into a silent all-clear.
 */
export function parseResponse(response: string): ScanVerdict {
	const text = response.replaceAll('\0', '').trim();

	if (/\bFOUND\b/.test(text)) return 'infected';
	if (/\bERROR\b/.test(text)) return 'failed';
	if (/\bOK\b/.test(text)) return 'clean';

	return 'failed';
}

/**
 * Send one buffer to clamd and wait for its verdict.
 *
 * Every failure path — refused connection, timeout, socket error, truncated
 * reply — resolves to `failed`, which the gate treats as not servable. A scanner
 * that throws would surface as an unhandled rejection in the background job and
 * leave the row `pending`, which is the same outcome by a longer route; being
 * explicit means the reason is recorded rather than inferred.
 */
export function scanWithClamAv(bytes: Buffer, options: ClamAvOptions): Promise<ScanVerdict> {
	return new Promise((resolve) => {
		const socket = net.createConnection({ host: options.host, port: options.port });
		const chunks: Buffer[] = [];
		let settled = false;

		/** Resolve once. Several of these fire together on a mid-transfer failure. */
		function finish(verdict: ScanVerdict) {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(verdict);
		}

		// `setTimeout` here is an *idle* timeout, which a daemon that accepts the
		// connection and then says nothing would never trip while data is still
		// flowing. The explicit timer bounds the whole exchange.
		const deadline = setTimeout(() => finish('failed'), options.timeoutMs);
		socket.setTimeout(options.timeoutMs, () => finish('failed'));

		socket.on('error', () => finish('failed'));

		socket.on('connect', () => {
			socket.write('zINSTREAM\0');

			for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
				const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
				const header = Buffer.alloc(4);
				header.writeUInt32BE(chunk.length, 0);
				socket.write(header);
				socket.write(chunk);
			}

			// A zero-length chunk is the terminator. Without it clamd waits forever
			// and the scan dies on the timeout instead of returning a verdict.
			const terminator = Buffer.alloc(4);
			terminator.writeUInt32BE(0, 0);
			socket.write(terminator);

			// An empty file still needs the handshake above: clamd answers `OK` for
			// zero bytes, and short-circuiting here would mean an empty upload was
			// never actually offered to the scanner.
		});

		socket.on('data', (chunk) => {
			chunks.push(chunk);
			// Replies are NUL-terminated because of the `z` prefix, so this is the
			// point the daemon has finished talking.
			if (chunk.includes(0)) {
				clearTimeout(deadline);
				finish(parseResponse(Buffer.concat(chunks).toString('utf8')));
			}
		});

		socket.on('close', () => {
			clearTimeout(deadline);
			// Closed before a terminated reply arrived. Whatever we have is partial,
			// and a partial reply is not a clean one.
			finish(chunks.length > 0 ? parseResponse(Buffer.concat(chunks).toString('utf8')) : 'failed');
		});
	});
}

/**
 * Read the daemon's address from configuration.
 *
 * Throws rather than defaulting to localhost. `FILE_SCANNER=clamav` with no host
 * set is a deployment that believes it is scanning uploads; guessing an address
 * would let it keep believing that while every scan quietly failed.
 */
export function clamAvOptions(): ClamAvOptions {
	if (!CLAMAV_HOST) {
		throw new Error(
			'FILE_SCANNER=clamav requires CLAMAV_HOST. Set it to the clamd daemon’s address.'
		);
	}

	return { host: CLAMAV_HOST, port: CLAMAV_PORT, timeoutMs: CLAMAV_TIMEOUT_MS };
}
