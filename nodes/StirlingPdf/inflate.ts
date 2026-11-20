/**
 * Minimal pure TypeScript implementation of raw DEFLATE decompression (RFC 1951).
 *
 * n8n Cloud does not allow community nodes to import Node.js built-ins such as `zlib`, so this
 * small decoder is used to unpack ZIP archives returned by Stirling-PDF.
 */

class Huffman {
	counts = new Uint16Array(16);
	symbols: Uint16Array;

	constructor(size: number) {
		this.symbols = new Uint16Array(size);
	}

	build(lengths: Uint8Array, offset: number, count: number): void {
		this.counts.fill(0);
		for (let i = 0; i < count; i++) this.counts[lengths[offset + i]]++;
		this.counts[0] = 0;

		const offs = new Uint16Array(16);
		for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + this.counts[i - 1];
		for (let i = 0; i < count; i++) {
			const len = lengths[offset + i];
			if (len) this.symbols[offs[len]++] = i;
		}
	}
}

const LENGTH_BASE = [
	3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
	163, 195, 227, 258,
];
const LENGTH_EXTRA = [
	0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
	1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
	3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
	0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

const fixedLit = new Huffman(288);
const fixedDist = new Huffman(30);
(() => {
	const lengths = new Uint8Array(288);
	lengths.fill(8, 0, 144);
	lengths.fill(9, 144, 256);
	lengths.fill(7, 256, 280);
	lengths.fill(8, 280, 288);
	fixedLit.build(lengths, 0, 288);
	fixedDist.build(new Uint8Array(30).fill(5), 0, 30);
})();

class Inflater {
	private pos = 0;
	private bitBuf = 0;
	private bitCount = 0;
	private out: Uint8Array;
	private outLen = 0;

	constructor(
		private readonly src: Uint8Array,
		sizeHint: number,
	) {
		this.out = new Uint8Array(Math.max(sizeHint, 1024));
	}

	private bits(n: number): number {
		while (this.bitCount < n) {
			if (this.pos >= this.src.length) throw new Error('Unexpected end of deflate stream');
			this.bitBuf |= this.src[this.pos++] << this.bitCount;
			this.bitCount += 8;
		}
		const value = this.bitBuf & ((1 << n) - 1);
		this.bitBuf >>>= n;
		this.bitCount -= n;
		return value;
	}

	private decode(h: Huffman): number {
		let code = 0;
		let first = 0;
		let index = 0;
		for (let len = 1; len < 16; len++) {
			code |= this.bits(1);
			const count = h.counts[len];
			if (code - first < count) return h.symbols[index + code - first];
			index += count;
			first = (first + count) << 1;
			code <<= 1;
		}
		throw new Error('Invalid Huffman code in deflate stream');
	}

	private ensure(extra: number): void {
		if (this.outLen + extra <= this.out.length) return;
		let size = this.out.length * 2;
		while (size < this.outLen + extra) size *= 2;
		const next = new Uint8Array(size);
		next.set(this.out.subarray(0, this.outLen));
		this.out = next;
	}

	private stored(): void {
		this.bitBuf = 0;
		this.bitCount = 0;
		if (this.pos + 4 > this.src.length) throw new Error('Unexpected end of deflate stream');
		const len = this.src[this.pos] | (this.src[this.pos + 1] << 8);
		this.pos += 4;
		if (this.pos + len > this.src.length) throw new Error('Unexpected end of deflate stream');
		this.ensure(len);
		this.out.set(this.src.subarray(this.pos, this.pos + len), this.outLen);
		this.outLen += len;
		this.pos += len;
	}

	private dynamicTables(lit: Huffman, dist: Huffman): void {
		const hlit = this.bits(5) + 257;
		const hdist = this.bits(5) + 1;
		const hclen = this.bits(4) + 4;
		const lengths = new Uint8Array(320);
		for (let i = 0; i < hclen; i++) lengths[CODE_LENGTH_ORDER[i]] = this.bits(3);
		const codeLen = new Huffman(19);
		codeLen.build(lengths, 0, 19);

		lengths.fill(0);
		let n = 0;
		while (n < hlit + hdist) {
			const sym = this.decode(codeLen);
			if (sym < 16) {
				lengths[n++] = sym;
				continue;
			}
			let repeat: number;
			let value = 0;
			if (sym === 16) {
				if (n === 0) throw new Error('Invalid deflate code lengths');
				value = lengths[n - 1];
				repeat = 3 + this.bits(2);
			} else if (sym === 17) {
				repeat = 3 + this.bits(3);
			} else {
				repeat = 11 + this.bits(7);
			}
			while (repeat--) lengths[n++] = value;
		}
		lit.build(lengths, 0, hlit);
		dist.build(lengths, hlit, hdist);
	}

	private block(lit: Huffman, dist: Huffman): void {
		for (;;) {
			const sym = this.decode(lit);
			if (sym === 256) return;
			if (sym < 256) {
				this.ensure(1);
				this.out[this.outLen++] = sym;
				continue;
			}
			const li = sym - 257;
			if (li >= 29) throw new Error('Invalid length code in deflate stream');
			const length = LENGTH_BASE[li] + this.bits(LENGTH_EXTRA[li]);
			const di = this.decode(dist);
			if (di >= 30) throw new Error('Invalid distance code in deflate stream');
			const distance = DIST_BASE[di] + this.bits(DIST_EXTRA[di]);
			if (distance > this.outLen) throw new Error('Invalid distance in deflate stream');
			this.ensure(length);
			for (let k = 0; k < length; k++) {
				this.out[this.outLen] = this.out[this.outLen - distance];
				this.outLen++;
			}
		}
	}

	run(): Uint8Array {
		const lit = new Huffman(288);
		const dist = new Huffman(30);
		let final = 0;
		do {
			final = this.bits(1);
			const type = this.bits(2);
			if (type === 0) this.stored();
			else if (type === 1) this.block(fixedLit, fixedDist);
			else if (type === 2) {
				this.dynamicTables(lit, dist);
				this.block(lit, dist);
			} else throw new Error('Invalid deflate block type');
		} while (!final);
		return this.out.subarray(0, this.outLen);
	}
}

export function inflateRaw(data: Uint8Array, expectedSize = 0): Uint8Array {
	return new Inflater(data, expectedSize || data.length * 3).run();
}
