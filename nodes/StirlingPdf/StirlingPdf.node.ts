import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	extractZip,
	fileNameFromDisposition,
	getHeader,
	isZipBuffer,
	mimeFromFileName,
	stirlingApiRequest,
	type FormPart,
	type StirlingResponse,
} from './GenericFunctions';
import { findOperation, operations, resources, type OperationDef } from './operations';

const OUTPUT_OPTION_NAMES = new Set(['outputBinaryPropertyName', 'extractZip', 'outputFileName']);

// ------------------------------------------------------------------ properties builder

function showFor(ops: OperationDef[], extra: IDataObject = {}): INodeProperties['displayOptions'] {
	const byResource = new Map<string, string[]>();
	for (const op of ops) {
		byResource.set(op.resource, [...(byResource.get(op.resource) ?? []), op.value]);
	}
	// A property can only have one `show` block; operations of different resources therefore get
	// one property per resource (see buildProperties)
	const [[resource, values]] = [...byResource.entries()];
	return { show: { resource: [resource], operation: values, ...extra } };
}

function groupByResource(ops: OperationDef[]): OperationDef[][] {
	const groups = new Map<string, OperationDef[]>();
	for (const op of ops) groups.set(op.resource, [...(groups.get(op.resource) ?? []), op]);
	return [...groups.values()];
}

function buildProperties(): INodeProperties[] {
	const props: INodeProperties[] = [
		{
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			options: resources,
			default: 'page',
		},
	];

	// Operation selectors
	for (const resource of resources) {
		if (resource.value === 'custom') continue;
		const ops = operations
			.filter((o) => o.resource === resource.value)
			.sort((a, b) => a.name.localeCompare(b.name));
		// eslint-disable-next-line n8n-nodes-base/node-param-default-missing
		props.push({
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [resource.value] } },
			options: ops.map((o) => ({
				name: o.name,
				value: o.value,
				action: o.action,
				description: o.description,
			})),
			default: ops[0].value,
		});
	}

	// ---- input: single file
	for (const group of groupByResource(operations.filter((o) => o.input === 'file'))) {
		props.push({
			displayName: 'Input Binary Field',
			name: 'binaryPropertyName',
			type: 'string',
			default: 'data',
			required: true,
			hint: 'The name of the input binary field containing the file to process',
			displayOptions: showFor(group),
		});
	}

	// ---- input: multiple files
	for (const group of groupByResource(operations.filter((o) => o.input === 'files'))) {
		props.push(
			{
				displayName: 'Input Mode',
				name: 'inputMode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'All Items Combined',
						value: 'allItems',
						description: 'Send the files of all input items in a single request (one output item)',
					},
					{
						name: 'Each Item Separately',
						value: 'eachItem',
						description:
							'Send one request per item, using all binary fields listed below of that item',
					},
				],
				default: 'allItems',
				displayOptions: showFor(group),
			},
			{
				displayName: 'Input Binary Fields',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				hint: 'Comma-separated names of the binary fields containing the files, in order',
				displayOptions: showFor(group),
			},
		);
	}

	// ---- input: URL
	for (const group of groupByResource(operations.filter((o) => o.input === 'url'))) {
		props.push({
			displayName: 'URL',
			name: 'urlInput',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://example.com',
			description: 'URL of the web page to convert',
			displayOptions: showFor(group),
		});
	}

	// ---- operation specific fields + options
	for (const op of operations) {
		for (const field of op.fields ?? []) {
			const extraShow = (field.displayOptions?.show ?? {}) as IDataObject;
			props.push({ ...field, displayOptions: showFor([op], extraShow) });
		}

		const options = [...(op.options ?? [])];
		if (!op.jsonResponse) {
			options.push(
				{
					displayName: 'Extract ZIP Results',
					name: 'extractZip',
					type: 'boolean',
					default: true,
					description:
						'Whether to unpack ZIP responses (e.g. split results, images) into one output item per file',
				},
				{
					displayName: 'Output Binary Field',
					name: 'outputBinaryPropertyName',
					type: 'string',
					default: 'data',
					description: 'Name of the binary field to put the resulting file in',
				},
				{
					displayName: 'Output File Name',
					name: 'outputFileName',
					type: 'string',
					default: '',
					description: 'Override the file name returned by Stirling-PDF',
				},
			);
		}
		if (options.length) {
			props.push({
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: showFor([op]),
				options: options.sort((a, b) => a.displayName.localeCompare(b.displayName)),
			});
		}
	}

	// ---- custom API call
	const custom = { show: { resource: ['custom'] } };
	props.push(
		{
			displayName: 'Method',
			name: 'method',
			type: 'options',
			options: [
				{ name: 'GET', value: 'GET' },
				{ name: 'POST', value: 'POST' },
			],
			default: 'POST',
			displayOptions: custom,
		},
		{
			displayName: 'Endpoint',
			name: 'endpoint',
			type: 'string',
			default: '/api/v1/',
			required: true,
			placeholder: '/api/v1/misc/compress-pdf',
			description:
				'Path of the Stirling-PDF endpoint (see /swagger-ui/index.html on your instance)',
			displayOptions: custom,
		},
		{
			displayName: 'Send Files',
			name: 'sendFiles',
			type: 'boolean',
			default: true,
			description: 'Whether to upload binary files of the input item',
			displayOptions: { show: { resource: ['custom'], method: ['POST'] } },
		},
		{
			displayName: 'File Fields',
			name: 'fileFields',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add File',
			default: { files: [{ formField: 'fileInput', binaryPropertyName: 'data' }] },
			displayOptions: { show: { resource: ['custom'], method: ['POST'], sendFiles: [true] } },
			options: [
				{
					name: 'files',
					displayName: 'File',
					values: [
						{
							displayName: 'Form Field Name',
							name: 'formField',
							type: 'string',
							default: 'fileInput',
						},
						{
							displayName: 'Input Binary Field',
							name: 'binaryPropertyName',
							type: 'string',
							default: 'data',
							hint: 'Comma-separate several names to send multiple files under the same form field',
						},
					],
				},
			],
		},
		{
			displayName: 'Form Parameters',
			name: 'formParameters',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add Parameter',
			default: {},
			displayOptions: { show: { resource: ['custom'], method: ['POST'] } },
			options: [
				{
					name: 'parameters',
					displayName: 'Parameter',
					values: [
						{ displayName: 'Name', name: 'name', type: 'string', default: '' },
						{ displayName: 'Value', name: 'value', type: 'string', default: '' },
					],
				},
			],
		},
		{
			displayName: 'Options',
			name: 'options',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: custom,
			options: [
				{
					displayName: 'Extract ZIP Results',
					name: 'extractZip',
					type: 'boolean',
					default: true,
					description: 'Whether to unpack ZIP responses into one output item per file',
				},
				{
					displayName: 'Output Binary Field',
					name: 'outputBinaryPropertyName',
					type: 'string',
					default: 'data',
					description: 'Name of the binary field to put the resulting file in',
				},
				{
					displayName: 'Output File Name',
					name: 'outputFileName',
					type: 'string',
					default: '',
					description: 'Override the file name returned by Stirling-PDF',
				},
			],
		},
	);

	return props;
}

// ------------------------------------------------------------------ helpers

function toNodeError(
	ctx: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		if (error.context) error.context.itemIndex = itemIndex;
		return error;
	}
	return new NodeOperationError(ctx.getNode(), error as Error, { itemIndex });
}

function toFormValue(value: unknown): string {
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'object' && value !== null) return JSON.stringify(value);
	return String(value);
}

async function getFilePart(
	ctx: IExecuteFunctions,
	itemIndex: number,
	binaryPropertyName: string,
	formField: string,
): Promise<FormPart> {
	const binary: IBinaryData = ctx.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const data = await ctx.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const fileName =
		binary.fileName ??
		`${binaryPropertyName}${binary.fileExtension ? `.${binary.fileExtension}` : ''}`;
	return {
		name: formField,
		data,
		fileName,
		mimeType: binary.mimeType || mimeFromFileName(fileName),
	};
}

function splitNames(value: string): string[] {
	return value
		.split(',')
		.map((v) => v.trim())
		.filter((v) => v !== '');
}

/** Collect the form parameters (fields + options) of an operation for one item. */
async function collectParameters(
	ctx: IExecuteFunctions,
	op: OperationDef,
	itemIndex: number,
): Promise<FormPart[]> {
	const parts: FormPart[] = [];
	const fileFields = new Set(op.fileFields ?? []);
	const arrayFields = new Set(op.arrayFields ?? []);
	const skipDefaults = new Set(op.skipDefaults ?? []);

	const values: IDataObject = {};

	for (const field of op.fields ?? []) {
		// Respect conditional fields (e.g. stampText only for text stamps)
		const condition = field.displayOptions?.show as IDataObject | undefined;
		if (condition) {
			const visible = Object.entries(condition).every(([key, allowed]) =>
				(allowed as unknown[]).includes(ctx.getNodeParameter(key, itemIndex)),
			);
			if (!visible) continue;
		}
		values[field.name] = ctx.getNodeParameter(field.name, itemIndex);
	}

	const options = ctx.getNodeParameter('options', itemIndex, {}) as IDataObject;
	for (const option of op.options ?? []) {
		if (option.name in options) {
			values[option.name] = options[option.name];
		} else if (
			!skipDefaults.has(option.name) &&
			option.type !== 'fixedCollection' &&
			option.default !== '' &&
			option.default !== undefined
		) {
			// Stirling-PDF expects most parameters to be present: send the documented default
			values[option.name] = option.default;
		}
	}

	for (const [name, value] of Object.entries(values)) {
		if (OUTPUT_OPTION_NAMES.has(name)) continue;
		if (fileFields.has(name)) {
			parts.push(await getFilePart(ctx, itemIndex, String(value), name));
		} else if (name === 'allRequestParams') {
			const entries = ((value as IDataObject).entries ?? []) as Array<{
				key: string;
				value: string;
			}>;
			const map: Record<string, string> = {};
			for (const entry of entries) if (entry.key) map[entry.key] = entry.value;
			if (Object.keys(map).length) parts.push({ name, value: JSON.stringify(map) });
		} else if (arrayFields.has(name)) {
			for (const v of splitNames(String(value))) parts.push({ name, value: v });
		} else if (value !== undefined && value !== null) {
			parts.push({ name, value: toFormValue(value) });
		}
	}
	return parts;
}

function responseToItems(
	ctx: IExecuteFunctions,
	response: StirlingResponse,
	options: IDataObject,
	pairedItem: INodeExecutionData['pairedItem'],
	forceJson: boolean,
): Promise<INodeExecutionData[]> {
	return (async () => {
		const contentType = (getHeader(response.headers, 'content-type') ?? '').toLowerCase();

		if (forceJson || contentType.includes('application/json')) {
			const text = response.body.toString('utf8');
			let json: IDataObject;
			try {
				const parsed = JSON.parse(text) as unknown;
				json = (Array.isArray(parsed) ? { data: parsed } : (parsed as IDataObject)) ?? {};
			} catch {
				json = { data: text };
			}
			return [{ json, pairedItem }];
		}

		const binaryProperty = (options.outputBinaryPropertyName as string) || 'data';
		const responseName =
			fileNameFromDisposition(getHeader(response.headers, 'content-disposition')) ?? 'output';
		const fileName = (options.outputFileName as string) || responseName;
		const isZip =
			isZipBuffer(response.body) &&
			(contentType.includes('zip') && !contentType.includes('epub')
				? true
				: responseName.toLowerCase().endsWith('.zip'));

		if (isZip && options.extractZip !== false) {
			const entries = extractZip(response.body);
			const items: INodeExecutionData[] = [];
			for (const [index, entry] of entries.entries()) {
				const binary = await ctx.helpers.prepareBinaryData(
					entry.data,
					entry.fileName,
					mimeFromFileName(entry.fileName),
				);
				items.push({
					json: {
						fileName: entry.fileName,
						fileSize: entry.data.length,
						index,
						total: entries.length,
						sourceArchive: responseName,
					},
					binary: { [binaryProperty]: binary },
					pairedItem,
				});
			}
			return items;
		}

		const mimeType =
			contentType && !contentType.startsWith('application/octet-stream')
				? contentType.split(';')[0].trim()
				: mimeFromFileName(fileName);
		const binary = await ctx.helpers.prepareBinaryData(response.body, fileName, mimeType);
		return [
			{
				json: { fileName, mimeType, fileSize: response.body.length },
				binary: { [binaryProperty]: binary },
				pairedItem,
			},
		];
	})();
}

// ------------------------------------------------------------------ node

export class StirlingPdf implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Stirling-PDF',
		name: 'stirlingPdf',
		icon: { light: 'file:stirlingPdf.svg', dark: 'file:stirlingPdf.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle:
			'={{$parameter["resource"] === "custom" ? $parameter["endpoint"] : $parameter["operation"]}}',
		description: 'Edit, convert, secure and analyze PDFs with a self-hosted Stirling-PDF instance',
		defaults: {
			name: 'Stirling-PDF',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'stirlingPdfApi',
				required: true,
			},
		],
		properties: buildProperties(),
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;

		// ------------------------------------------------ custom API call
		if (resource === 'custom') {
			for (let i = 0; i < items.length; i++) {
				try {
					const method = this.getNodeParameter('method', i) as IHttpRequestMethods;
					const endpoint = this.getNodeParameter('endpoint', i) as string;
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const parts: FormPart[] = [];
					if (method === 'POST') {
						if (this.getNodeParameter('sendFiles', i) as boolean) {
							const files = (this.getNodeParameter('fileFields.files', i, []) ?? []) as Array<{
								formField: string;
								binaryPropertyName: string;
							}>;
							for (const file of files) {
								for (const name of splitNames(file.binaryPropertyName)) {
									parts.push(await getFilePart(this, i, name, file.formField || 'fileInput'));
								}
							}
						}
						const params = this.getNodeParameter('formParameters.parameters', i, []) as Array<{
							name: string;
							value: string;
						}>;
						for (const p of params) if (p.name) parts.push({ name: p.name, value: p.value ?? '' });
					}
					const response = await stirlingApiRequest.call(this, method, endpoint, parts, i);
					returnData.push(...(await responseToItems(this, response, options, { item: i }, false)));
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
						continue;
					}
					throw toNodeError(this, error, i);
				}
			}
			return [returnData];
		}

		// ------------------------------------------------ predefined operations
		const operation = this.getNodeParameter('operation', 0) as string;
		const op = findOperation(resource, operation);
		if (!op) {
			throw new NodeOperationError(
				this.getNode(),
				`Unsupported operation "${resource}/${operation}"`,
			);
		}

		// Multiple files combined from all input items → single request
		if (op.input === 'files' && this.getNodeParameter('inputMode', 0) === 'allItems') {
			try {
				const parts: FormPart[] = [];
				for (let i = 0; i < items.length; i++) {
					const names = splitNames(this.getNodeParameter('binaryPropertyName', i) as string);
					for (const name of names) {
						if (items[i].binary?.[name]) parts.push(await getFilePart(this, i, name, 'fileInput'));
					}
				}
				if (!parts.length) {
					throw new NodeOperationError(this.getNode(), 'No input binary files found', {
						description: 'Check the "Input Binary Fields" parameter',
					});
				}
				parts.push(...(await collectParameters(this, op, 0)));
				const options = this.getNodeParameter('options', 0, {}) as IDataObject;
				const response = await stirlingApiRequest.call(this, 'POST', op.endpoint, parts, 0);
				const pairedItem = items.map((_, index) => ({ item: index }));
				returnData.push(
					...(await responseToItems(this, response, options, pairedItem, !!op.jsonResponse)),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: 0 } });
				} else {
					throw toNodeError(this, error, 0);
				}
			}
			return [returnData];
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const parts: FormPart[] = [];
				if (op.input === 'file') {
					const name = this.getNodeParameter('binaryPropertyName', i) as string;
					parts.push(await getFilePart(this, i, name, 'fileInput'));
				} else if (op.input === 'files') {
					const names = splitNames(this.getNodeParameter('binaryPropertyName', i) as string);
					for (const name of names) parts.push(await getFilePart(this, i, name, 'fileInput'));
				} else if (op.input === 'url') {
					parts.push({ name: 'urlInput', value: this.getNodeParameter('urlInput', i) as string });
				}
				parts.push(...(await collectParameters(this, op, i)));

				const options = op.jsonResponse
					? {}
					: (this.getNodeParameter('options', i, {}) as IDataObject);
				const response = await stirlingApiRequest.call(this, 'POST', op.endpoint, parts, i);
				returnData.push(
					...(await responseToItems(this, response, options, { item: i }, !!op.jsonResponse)),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw toNodeError(this, error, i);
			}
		}

		return [returnData];
	}
}
