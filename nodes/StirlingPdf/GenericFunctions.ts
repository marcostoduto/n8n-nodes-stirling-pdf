import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { inflateRaw } from './inflate';

export type FormPart =
	| { name: string; value: string }
	| { name: string; data: Buffer; fileName: string; mimeType: string };

export interface StirlingResponse {
	body: Buffer;
	headers: IDataObject;
	statusCode: number;
}

/** Build a multipart/form-data body without any third-party dependency. */
export function buildMultipartBody(parts: FormPart[]): { body: Buffer; contentType: string } {
	const boundary = `----n8nStirlingPdf${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
	const chunks: Buffer[] = [];
	const escape = (s: string) => s.replace(/\r?\n/g, ' ').replace(/"/g, '%22');

	for (const part of parts) {
		let header = `--${boundary}\r\nContent-Disposition: form-data; name="${escape(part.name)}"`;
		if ('data' in part) {
			header += `; filename="${escape(part.fileName)}"\r\nContent-Type: ${part.mimeType}\r\n\r\n`;
			chunks.push(Buffer.from(header, 'utf8'), part.data, Buffer.from('\r\n'));
		} else {
			header += '\r\n\r\n';
			chunks.push(
				Buffer.from(header, 'utf8'),
				Buffer.from(part.value, 'utf8'),
				Buffer.from('\r\n'),
			);
		}
	}
	chunks.push(Buffer.from(`--${boundary}--\r\n`));

	return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function parseErrorBody(body: Buffer): JsonObject {
	const text = body.toString('utf8');
	try {
		const parsed = JSON.parse(text) as JsonObject;
		const message = parsed.message ?? parsed.detail ?? parsed.error ?? parsed.title;
		return { ...parsed, message: typeof message === 'string' ? message : text };
	} catch {
		return { message: text.slice(0, 2000) || 'Unknown error' };
	}
}

export async function stirlingApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	parts?: FormPart[],
	itemIndex = 0,
): Promise<StirlingResponse> {
	const credentials = await this.getCredentials('stirlingPdfApi');
	const baseUrl = String(credentials.baseUrl).replace(/\/+$/, '');
	const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		encoding: 'arraybuffer',
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		skipSslCertificateValidation: credentials.ignoreSslIssues === true,
		json: false,
		headers: { Accept: '*/*' },
	};

	if (parts && method !== 'GET') {
		const { body, contentType } = buildMultipartBody(parts);
		options.body = body;
		options.headers = { ...options.headers, 'Content-Type': contentType };
	}

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'stirlingPdfApi',
		options,
	)) as { body: ArrayBuffer | Buffer | string; headers: IDataObject; statusCode: number };

	const body = Buffer.isBuffer(response.body)
		? response.body
		: typeof response.body === 'string'
			? Buffer.from(response.body, 'utf8')
			: Buffer.from(response.body as ArrayBuffer);

	if (response.statusCode >= 400) {
		const errorBody = parseErrorBody(body);
		throw new NodeApiError(this.getNode(), errorBody, {
			itemIndex,
			httpCode: String(response.statusCode),
			message: `Stirling-PDF returned ${response.statusCode}: ${String(errorBody.message)}`,
		});
	}

	return { body, headers: response.headers ?? {}, statusCode: response.statusCode };
}

export function getHeader(headers: IDataObject, name: string): string | undefined {
	const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
	if (!key) return undefined;
	const value = headers[key];
	return Array.isArray(value) ? String(value[0]) : value === undefined ? undefined : String(value);
}

export function fileNameFromDisposition(disposition?: string): string | undefined {
	if (!disposition) return undefined;
	const star = /filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/.exec(disposition);
	if (star) {
		try {
			return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
		} catch {
			return star[1].trim();
		}
	}
	const plain = /filename\s*=\s*"?([^";]+)"?/.exec(disposition);
	return plain ? plain[1].trim() : undefined;
}

const MIME_BY_EXTENSION: Record<string, string> = {
	pdf: 'application/pdf',
	zip: 'application/zip',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	svg: 'image/svg+xml',
	txt: 'text/plain',
	csv: 'text/csv',
	md: 'text/markdown',
	html: 'text/html',
	xml: 'application/xml',
	json: 'application/json',
	rtf: 'application/rtf',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	odt: 'application/vnd.oasis.opendocument.text',
	ppt: 'application/vnd.ms-powerpoint',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	odp: 'application/vnd.oasis.opendocument.presentation',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	epub: 'application/epub+zip',
	cbz: 'application/vnd.comicbook+zip',
	cbr: 'application/vnd.comicbook-rar',
};

export function mimeFromFileName(fileName: string, fallback = 'application/octet-stream'): string {
	const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
	return MIME_BY_EXTENSION[ext] ?? fallback;
}

export interface ZipEntry {
	fileName: string;
	data: Buffer;
}

/** Minimal ZIP reader (stored + deflate) used to split archives returned by Stirling-PDF. */
export function extractZip(buffer: Buffer): ZipEntry[] {
	const EOCD_SIG = 0x06054b50;
	let eocd = -1;
	for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
		if (buffer.readUInt32LE(i) === EOCD_SIG) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error('Invalid ZIP archive: end of central directory not found');

	const entryCount = buffer.readUInt16LE(eocd + 10);
	let offset = buffer.readUInt32LE(eocd + 16);
	const entries: ZipEntry[] = [];

	for (let n = 0; n < entryCount; n++) {
		if (buffer.readUInt32LE(offset) !== 0x02014b50) {
			throw new Error('Invalid ZIP archive: corrupt central directory');
		}
		const flags = buffer.readUInt16LE(offset + 8);
		const method = buffer.readUInt16LE(offset + 10);
		const compressedSize = buffer.readUInt32LE(offset + 20);
		const uncompressedSize = buffer.readUInt32LE(offset + 24);
		const nameLength = buffer.readUInt16LE(offset + 28);
		const extraLength = buffer.readUInt16LE(offset + 30);
		const commentLength = buffer.readUInt16LE(offset + 32);
		const localOffset = buffer.readUInt32LE(offset + 42);
		const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength);
		const fileName = rawName.toString(flags & 0x800 ? 'utf8' : 'latin1');
		offset += 46 + nameLength + extraLength + commentLength;

		if (fileName.endsWith('/')) continue; // directory

		const localNameLength = buffer.readUInt16LE(localOffset + 26);
		const localExtraLength = buffer.readUInt16LE(localOffset + 28);
		const dataStart = localOffset + 30 + localNameLength + localExtraLength;
		const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

		let data: Buffer;
		if (method === 0) data = Buffer.from(compressed);
		else if (method === 8) data = Buffer.from(inflateRaw(compressed, uncompressedSize));
		else throw new Error(`Unsupported ZIP compression method ${method} for "${fileName}"`);

		entries.push({ fileName: fileName.split('/').pop() ?? fileName, data });
	}
	return entries;
}

export function isZipBuffer(buffer: Buffer): boolean {
	return buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
}
