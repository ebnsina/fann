import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { scanWithClamAv } from './clamav';

/**
 * The driver against a real clamd.
 *
 * `clamav.spec.ts` proves we speak the wire format by checking it against a fake
 * that only answers a well-formed request. This proves the other half — that a
 * real daemon agrees — and it is the only test here that would notice ClamAV
 * changing its replies.
 *
 * Skipped unless something is listening, so it costs nothing on a machine without
 * a daemon. To run it:
 *
 *   docker run -d --name clamav -p 3310:3310 --platform linux/amd64 clamav/clamav
 *
 * The first start takes a minute or two while it loads signatures.
 */
const OPTIONS = { host: '127.0.0.1', port: 3310, timeoutMs: 60_000 };

const daemonReachable = await new Promise<boolean>((resolve) => {
	const socket = net.createConnection({ host: OPTIONS.host, port: OPTIONS.port });
	const done = (reachable: boolean) => {
		socket.destroy();
		resolve(reachable);
	};
	socket.setTimeout(1000, () => done(false));
	socket.on('connect', () => done(true));
	socket.on('error', () => done(false));
});

/**
 * EICAR — the standard harmless string every scanner is required to flag.
 *
 * Split across a join so this source file is not itself detected by a scanner
 * reading the repository, which is a real and extremely confusing way to break a
 * checkout.
 */
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR', '-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(
	''
);

describe.skipIf(!daemonReachable)('against a real clamd', () => {
	it('passes a clean file', async () => {
		expect(await scanWithClamAv(Buffer.from('%PDF-1.4\n%%EOF'), OPTIONS)).toBe('clean');
	});

	it('catches EICAR', async () => {
		expect(await scanWithClamAv(Buffer.from(EICAR), OPTIONS)).toBe('infected');
	});

	it('passes an empty file', async () => {
		// clamd answers OK for zero bytes. Short-circuiting in the driver would mean
		// an empty upload was never actually offered to the scanner.
		expect(await scanWithClamAv(Buffer.alloc(0), OPTIONS)).toBe('clean');
	});

	it('handles a payload spanning several chunks', async () => {
		// Well over the 64KB frame, so the chunking loop runs many times. Offset
		// arithmetic that is wrong here hangs until the timeout rather than passing.
		expect(await scanWithClamAv(Buffer.alloc(300_000, 0x41), OPTIONS)).toBe('clean');
	});

	/*
	 * Deliberately not tested: EICAR buried inside a larger file.
	 *
	 * ClamAV reports that clean, and so does its own `clamdscan` against the same
	 * bytes — the signature is defined to match only a standalone file. An earlier
	 * version of this spec asserted `infected` there and failed, which looked like a
	 * chunking bug in the driver and was not. What that case would actually measure
	 * is ClamAV's signature policy, which is not ours to assert.
	 */
});
