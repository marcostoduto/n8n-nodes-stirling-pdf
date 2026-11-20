import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

/**
 * Declarative description of every Stirling-PDF endpoint exposed by the node.
 *
 * - `fields` become top-level node parameters, `options` go into the "Options" collection.
 * - The parameter `name` is sent as-is as multipart form field name.
 * - Parameters listed in `fileFields` contain the name of a binary property; the binary is uploaded
 *   as a file under the same form field name.
 */
export type InputType = 'file' | 'files' | 'url' | 'none';

export interface OperationDef {
	resource: string;
	value: string;
	name: string;
	action: string;
	description: string;
	endpoint: string;
	input: InputType;
	/** Description of the expected input file(s) */
	inputHint?: string;
	fields?: INodeProperties[];
	options?: INodeProperties[];
	fileFields?: string[];
	/** Response is JSON (analysis endpoints) */
	jsonResponse?: boolean;
	/** Parameters whose comma-separated value is sent as repeated form fields */
	arrayFields?: string[];
	/** Options whose default value is NOT sent when the user did not add them */
	skipDefaults?: string[];
}

// ---------------------------------------------------------------- helpers

const str = (
	name: string,
	displayName: string,
	defaultValue: string,
	description: string,
	extra: Partial<INodeProperties> = {},
): INodeProperties => ({
	displayName,
	name,
	type: 'string',
	default: defaultValue,
	description,
	...extra,
});

const num = (
	name: string,
	displayName: string,
	defaultValue: number,
	description: string,
	extra: Partial<INodeProperties> = {},
): INodeProperties => ({
	displayName,
	name,
	type: 'number',
	default: defaultValue,
	description,
	...extra,
});

const bool = (
	name: string,
	displayName: string,
	defaultValue: boolean,
	description: string,
): INodeProperties => ({
	displayName,
	name,
	type: 'boolean',
	// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-boolean
	default: defaultValue,
	description,
});

const pick = (
	name: string,
	displayName: string,
	options: Array<[string, string | number]>,
	defaultValue: string | number,
	description: string,
	extra: Partial<INodeProperties> = {},
): INodeProperties => ({
	displayName,
	name,
	type: 'options',
	options: options.map(([n, v]) => ({ name: n, value: v })) as INodePropertyOptions[],
	default: defaultValue,
	description,
	...extra,
});

const binaryField = (name: string, displayName: string, description: string): INodeProperties =>
	str(name, displayName, '', description, {
		hint: 'Name of the binary property of the input item that contains the file',
	});

const PAGE_SELECTION_HINT =
	"Ranges like '1,3,5-9', 'all', or functions like '2n+1'. Page numbers start at 1.";

const pageNumbers = (description = 'The pages to select'): INodeProperties =>
	str('pageNumbers', 'Page Numbers', 'all', description, { hint: PAGE_SELECTION_HINT });

const POSITION_GRID: Array<[string, number]> = [
	['Top Left', 1],
	['Top Center', 2],
	['Top Right', 3],
	['Middle Left', 4],
	['Center', 5],
	['Middle Right', 6],
	['Bottom Left', 7],
	['Bottom Center', 8],
	['Bottom Right', 9],
];

const MARGINS: Array<[string, string]> = [
	['Small', 'small'],
	['Medium', 'medium'],
	['Large', 'large'],
	['Extra Large', 'x-large'],
];

const ALPHABETS: Array<[string, string]> = [
	['Arabic', 'arabic'],
	['Chinese', 'chinese'],
	['Japanese', 'japanese'],
	['Korean', 'korean'],
	['Roman (Latin)', 'roman'],
	['Thai', 'thai'],
];

const COLOR_TYPES: Array<[string, string]> = [
	['Black & White', 'blackwhite'],
	['Color', 'color'],
	['Greyscale', 'greyscale'],
];

const useOfficeConvert = bool(
	'useStirlingOfficeConvert',
	'Use Stirling Office Convert',
	false,
	'Whether to force the Stirling Office converter (when unset the server setting is used)',
);

// ---------------------------------------------------------------- resources

export const resources: INodePropertyOptions[] = [
	{ name: 'Analysis', value: 'analysis', description: 'Read information about a PDF' },
	{ name: 'Content', value: 'content', description: 'Stamps, watermarks, page numbers, metadata' },
	{ name: 'Conversion', value: 'convert', description: 'Convert from and to PDF' },
	{ name: 'Custom API Call', value: 'custom', description: 'Call any Stirling-PDF endpoint' },
	{ name: 'Optimization', value: 'optimize', description: 'Compress, OCR, repair' },
	{ name: 'Page', value: 'page', description: 'Merge, split, rotate, reorder pages' },
	{ name: 'Security', value: 'security', description: 'Passwords, redaction, sanitizing' },
];

// ---------------------------------------------------------------- operations

export const operations: OperationDef[] = [
	// ======================================================== PAGE
	{
		resource: 'page',
		value: 'merge',
		name: 'Merge',
		action: 'Merge PDFs',
		description: 'Merge multiple PDFs into a single document',
		endpoint: '/api/v1/general/merge-pdfs',
		input: 'files',
		options: [
			pick(
				'sortType',
				'Sort Type',
				[
					['By Date Created', 'byDateCreated'],
					['By Date Modified', 'byDateModified'],
					['By File Name', 'byFileName'],
					['By PDF Title', 'byPDFTitle'],
					['Order Provided', 'orderProvided'],
				],
				'orderProvided',
				'How to sort the input files before merging',
			),
			bool(
				'removeCertSign',
				'Remove Certificate Signatures',
				true,
				'Whether to remove digital certificate signatures from the merged PDF',
			),
			bool(
				'generateToc',
				'Generate Table of Contents',
				false,
				'Whether to generate bookmarks (table of contents) for each merged file',
			),
		],
	},
	{
		resource: 'page',
		value: 'split',
		name: 'Split',
		action: 'Split a PDF by page numbers',
		description: 'Split a PDF after the given page numbers',
		endpoint: '/api/v1/general/split-pages',
		input: 'file',
		fields: [
			str(
				'pageNumbers',
				'Split After Pages',
				'1',
				"Page numbers after which the PDF is cut, e.g. '1,3,5-9' or 'all' to split every page",
			),
		],
	},
	{
		resource: 'page',
		value: 'splitBySizeOrCount',
		name: 'Split by Size or Count',
		action: 'Split a PDF by size or count',
		description: 'Split a PDF by file size, pages per file or number of files',
		endpoint: '/api/v1/general/split-by-size-or-count',
		input: 'file',
		fields: [
			pick(
				'splitType',
				'Split By',
				[
					['File Size', 0],
					['Pages per File', 1],
					['Number of Files', 2],
				],
				1,
				'Criterion used to split the document',
			),
			str(
				'splitValue',
				'Split Value',
				'1',
				"A size like '500KB' or '10MB' for File Size, otherwise a whole number",
			),
		],
	},
	{
		resource: 'page',
		value: 'splitByChapters',
		name: 'Split by Chapters',
		action: 'Split a PDF by chapters',
		description: 'Split a PDF using its bookmarks',
		endpoint: '/api/v1/general/split-pdf-by-chapters',
		input: 'file',
		options: [
			num(
				'bookmarkLevel',
				'Bookmark Level',
				0,
				'Maximum bookmark nesting level to split on (0 = top-level bookmarks only)',
			),
			bool('includeMetadata', 'Include Metadata', false, 'Whether to keep metadata in the parts'),
			bool(
				'allowDuplicates',
				'Allow Duplicates',
				false,
				'Whether to allow duplicate bookmarks to create parts',
			),
		],
	},
	{
		resource: 'page',
		value: 'autoSplit',
		name: 'Auto Split (Divider Pages)',
		action: 'Auto split a PDF on divider pages',
		description: 'Split a scanned PDF on QR-code divider pages',
		endpoint: '/api/v1/misc/auto-split-pdf',
		input: 'file',
		options: [
			bool(
				'duplexMode',
				'Duplex Mode',
				false,
				'Whether the page after each divider should also be removed (duplex scans)',
			),
		],
	},
	{
		resource: 'page',
		value: 'rotate',
		name: 'Rotate',
		action: 'Rotate a PDF',
		description: 'Rotate all pages of a PDF',
		endpoint: '/api/v1/general/rotate-pdf',
		input: 'file',
		fields: [
			pick(
				'angle',
				'Angle',
				[
					['90°', 90],
					['180°', 180],
					['270°', 270],
				],
				90,
				'Clockwise rotation angle',
			),
		],
	},
	{
		resource: 'page',
		value: 'autoRotate',
		name: 'Auto Rotate',
		action: 'Auto rotate pages',
		description: 'Detect and fix the orientation of pages',
		endpoint: '/api/v1/misc/auto-rotate-pdf',
		input: 'file',
		options: [
			num(
				'confidenceThreshold',
				'Confidence Threshold',
				14,
				'Minimum Tesseract OSD confidence required before a correction is applied',
			),
			pick(
				'detectionMode',
				'Detection Mode',
				[
					['Auto', 'auto'],
					['OCR (Tesseract OSD)', 'osd'],
					['Text Direction', 'text'],
				],
				'auto',
				'How the page orientation is detected',
			),
			bool(
				'dryRun',
				'Dry Run',
				false,
				'Whether to only return a JSON report of the detected rotations without changing the PDF',
			),
		],
	},
	{
		resource: 'page',
		value: 'removePages',
		name: 'Remove Pages',
		action: 'Remove pages from a PDF',
		description: 'Delete the selected pages',
		endpoint: '/api/v1/general/remove-pages',
		input: 'file',
		fields: [pageNumbers('Pages to remove')],
	},
	{
		resource: 'page',
		value: 'rearrange',
		name: 'Rearrange Pages',
		action: 'Rearrange or select pages',
		description: 'Reorder, duplicate or select pages, or apply a preset ordering',
		endpoint: '/api/v1/general/rearrange-pages',
		input: 'file',
		fields: [
			pick(
				'customMode',
				'Mode',
				[
					['Booklet Sort', 'BOOKLET_SORT'],
					['Custom Order', 'CUSTOM'],
					['Duplex Sort', 'DUPLEX_SORT'],
					['Duplicate', 'DUPLICATE'],
					['Odd/Even Merge', 'ODD_EVEN_MERGE'],
					['Odd/Even Split', 'ODD_EVEN_SPLIT'],
					['Remove First', 'REMOVE_FIRST'],
					['Remove First and Last', 'REMOVE_FIRST_AND_LAST'],
					['Remove Last', 'REMOVE_LAST'],
					['Reverse Order', 'REVERSE_ORDER'],
					['Side Stitch Booklet Sort', 'SIDE_STITCH_BOOKLET_SORT'],
				],
				'CUSTOM',
				'How pages should be rearranged',
			),
			{
				...pageNumbers('New page order, e.g. 3,1,2 or 1-5,8'),
				displayOptions: { show: { customMode: ['CUSTOM'] } },
			},
		],
	},
	{
		resource: 'page',
		value: 'removeBlanks',
		name: 'Remove Blank Pages',
		action: 'Remove blank pages',
		description: 'Detect and remove blank pages',
		endpoint: '/api/v1/misc/remove-blanks',
		input: 'file',
		options: [
			num(
				'threshold',
				'Threshold',
				10,
				'Pixel whiteness threshold (0-255) to consider a pixel white',
			),
			num(
				'whitePercent',
				'White Percent',
				99.9,
				'Percentage of white pixels for a page to be blank',
				{
					typeOptions: { minValue: 0.1, maxValue: 100, numberPrecision: 1 },
				},
			),
		],
	},
	{
		resource: 'page',
		value: 'scale',
		name: 'Scale Pages',
		action: 'Scale pages',
		description: 'Change page size and/or scale the content',
		endpoint: '/api/v1/general/scale-pages',
		input: 'file',
		skipDefaults: ['customWidth', 'customHeight', 'customUnit'],
		fields: [
			pick(
				'pageSize',
				'Page Size',
				[
					['A0', 'A0'],
					['A1', 'A1'],
					['A2', 'A2'],
					['A3', 'A3'],
					['A4', 'A4'],
					['A5', 'A5'],
					['A6', 'A6'],
					['Custom', 'CUSTOM'],
					['Keep', 'KEEP'],
					['Legal', 'LEGAL'],
					['Letter', 'LETTER'],
				],
				'A4',
				'Target page size',
			),
		],
		options: [
			num('scaleFactor', 'Scale Factor', 1, 'Scale applied to the page content', {
				typeOptions: { numberPrecision: 2 },
			}),
			pick(
				'orientation',
				'Orientation',
				[
					['Landscape', 'LANDSCAPE'],
					['Portrait', 'PORTRAIT'],
				],
				'PORTRAIT',
				'Orientation of the target page size (ignored for Keep and Custom)',
			),
			num('customWidth', 'Custom Width', 210, 'Page width when Page Size is Custom'),
			num('customHeight', 'Custom Height', 297, 'Page height when Page Size is Custom'),
			pick(
				'customUnit',
				'Custom Unit',
				[
					['Centimeters', 'cm'],
					['Inches', 'in'],
					['Millimeters', 'mm'],
				],
				'mm',
				'Unit for custom width and height',
			),
		],
	},
	{
		resource: 'page',
		value: 'multiPageLayout',
		name: 'Multi-Page Layout',
		action: 'Put multiple pages on one sheet',
		description: 'Place several pages on a single sheet (N-up)',
		endpoint: '/api/v1/general/multi-page-layout',
		input: 'file',
		fields: [
			pick(
				'pagesPerSheet',
				'Pages per Sheet',
				[
					['2', 2],
					['4', 4],
					['9', 9],
					['16', 16],
				],
				2,
				'Number of pages placed on each sheet',
			),
		],
		options: [
			bool('addBorder', 'Add Border', false, 'Whether to draw a border around each page'),
			pick(
				'arrangement',
				'Arrangement',
				[
					['By Columns', 'BY_COLUMNS'],
					['By Rows', 'BY_ROWS'],
				],
				'BY_ROWS',
				'Fill order of the pages on the sheet',
			),
			pick(
				'orientation',
				'Orientation',
				[
					['Landscape', 'LANDSCAPE'],
					['Portrait', 'PORTRAIT'],
				],
				'PORTRAIT',
				'Orientation of the output sheets',
			),
			pick(
				'readingDirection',
				'Reading Direction',
				[
					['Left to Right', 'LTR'],
					['Right to Left', 'RTL'],
				],
				'LTR',
				'Direction in which pages are arranged',
			),
			num('innerMargin', 'Inner Margin', 0, 'Margin around each page, in points'),
		],
	},
	{
		resource: 'page',
		value: 'singlePage',
		name: 'Convert to Single Page',
		action: 'Convert to a single long page',
		description: 'Join all pages into one long page',
		endpoint: '/api/v1/general/pdf-to-single-page',
		input: 'file',
	},

	// ======================================================== CONTENT
	{
		resource: 'content',
		value: 'addPageNumbers',
		name: 'Add Page Numbers',
		action: 'Add page numbers',
		description: 'Add page numbers to a PDF',
		endpoint: '/api/v1/misc/add-page-numbers',
		input: 'file',
		fields: [
			pick('position', 'Position', POSITION_GRID, 8, 'Where to place the number on the page'),
		],
		options: [
			str(
				'customText',
				'Custom Text',
				'{n}',
				"Text for each number. Placeholders: {n}, {total}, {filename}. E.g. 'Page {n} of {total}'.",
			),
			pick('customMargin', 'Margin', MARGINS, 'medium', 'Distance from the page edge'),
			str('fontColor', 'Font Color', '#000000', 'Hex color of the numbers'),
			num('fontSize', 'Font Size', 12, 'Font size of the numbers'),
			pick(
				'fontType',
				'Font',
				[
					['Courier', 'courier'],
					['Helvetica', 'helvetica'],
					['Times', 'times'],
				],
				'helvetica',
				'Font of the numbers',
			),
			str('pagesToNumber', 'Pages to Number', 'all', 'Which pages to number', {
				hint: PAGE_SELECTION_HINT,
			}),
			num('startingNumber', 'Starting Number', 1, 'First page number'),
			num(
				'zeroPad',
				'Zero Padding',
				0,
				'Zero-pad numbers to this width (Bates numbering). 0 disables padding.',
			),
		],
	},
	{
		resource: 'content',
		value: 'addStamp',
		name: 'Add Stamp',
		action: 'Add a text, image or QR stamp',
		description: 'Add a text, image or QR-code stamp to pages',
		endpoint: '/api/v1/misc/add-stamp',
		input: 'file',
		fileFields: ['stampImage'],
		fields: [
			pick(
				'stampType',
				'Stamp Type',
				[
					['Image', 'image'],
					['QR Code', 'qr'],
					['Text', 'text'],
				],
				'text',
				'Kind of stamp',
			),
			{
				...str('stampText', 'Stamp Text', '', 'Stamp text, or content of the QR code'),
				displayOptions: { show: { stampType: ['text', 'qr'] } },
			},
			{
				...binaryField(
					'stampImage',
					'Stamp Image Binary Field',
					'Binary property containing the stamp image',
				),
				default: 'image',
				displayOptions: { show: { stampType: ['image'] } },
			},
		],
		options: [
			pick('alphabet', 'Alphabet', ALPHABETS, 'roman', 'Font script matching the stamp text'),
			str('customColor', 'Color', '#d3d3d3', 'Hex color of the stamp text'),
			pick('customMargin', 'Margin', MARGINS, 'medium', 'Distance from the page edge'),
			num('fontSize', 'Font Size', 40, 'Text size in points (for images: image height)'),
			num('opacity', 'Opacity', 0.5, 'Opacity from 0 to 1', {
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
			}),
			num(
				'overrideX',
				'Override X',
				-1,
				'X coordinate in points; when both overrides are ≥ 0 they replace Position',
			),
			num(
				'overrideY',
				'Override Y',
				-1,
				'Y coordinate in points; when both overrides are ≥ 0 they replace Position',
			),
			str('pageNumbers', 'Page Numbers', 'all', 'Pages to stamp', { hint: PAGE_SELECTION_HINT }),
			pick('position', 'Position', POSITION_GRID, 5, 'Where to place the stamp'),
			num('rotation', 'Rotation', 0, 'Rotation in degrees'),
		],
	},
	{
		resource: 'content',
		value: 'addWatermark',
		name: 'Add Watermark',
		action: 'Add a watermark',
		description: 'Add a repeated text or image watermark',
		endpoint: '/api/v1/security/add-watermark',
		input: 'file',
		fileFields: ['watermarkImage'],
		fields: [
			pick(
				'watermarkType',
				'Watermark Type',
				[
					['Image', 'image'],
					['Text', 'text'],
				],
				'text',
				'Kind of watermark',
			),
			{
				...str('watermarkText', 'Watermark Text', '', 'Text of the watermark'),
				displayOptions: { show: { watermarkType: ['text'] } },
			},
			{
				...binaryField(
					'watermarkImage',
					'Watermark Image Binary Field',
					'Binary property containing the watermark image',
				),
				default: 'image',
				displayOptions: { show: { watermarkType: ['image'] } },
			},
		],
		options: [
			pick('alphabet', 'Alphabet', ALPHABETS, 'roman', 'Font script matching the watermark text'),
			str('customColor', 'Color', '#d3d3d3', 'Hex color of the watermark text'),
			bool(
				'convertPDFToImage',
				'Convert PDF to Image',
				false,
				'Whether to rasterize pages so the watermark is hard to remove',
			),
			num('fontSize', 'Font Size', 30, 'Text size in points (for images: image height)'),
			num('heightSpacer', 'Height Spacer', 50, 'Vertical space between watermarks'),
			num('opacity', 'Opacity', 0.5, 'Opacity from 0 to 1', {
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
			}),
			num('rotation', 'Rotation', 45, 'Rotation in degrees'),
			num('widthSpacer', 'Width Spacer', 50, 'Horizontal space between watermarks'),
		],
	},
	{
		resource: 'content',
		value: 'addImage',
		name: 'Add Image',
		action: 'Add an image to a PDF',
		description: 'Draw an image at a given position',
		endpoint: '/api/v1/misc/add-image',
		input: 'file',
		fileFields: ['imageFile'],
		fields: [
			{
				...binaryField(
					'imageFile',
					'Image Binary Field',
					'Binary property containing the image (raster or SVG)',
				),
				default: 'image',
			},
		],
		options: [
			bool(
				'everyPage',
				'Every Page',
				false,
				'Whether to draw the image on every page instead of only the first',
			),
			num('x', 'X', 0, "X of the image's lower-left corner, in points"),
			num('y', 'Y', 0, "Y of the image's lower-left corner, in points"),
		],
	},
	{
		resource: 'content',
		value: 'updateMetadata',
		name: 'Update Metadata',
		action: 'Update PDF metadata',
		description: 'Change title, author and other metadata',
		endpoint: '/api/v1/misc/update-metadata',
		input: 'file',
		fields: [
			bool(
				'deleteAll',
				'Delete All',
				false,
				'Whether to remove all metadata (ignores other fields)',
			),
			bool(
				'keepOmitted',
				'Keep Omitted Fields',
				true,
				'Whether to keep the current value of fields not specified here (otherwise they are removed)',
			),
		],
		skipDefaults: ['trapped'],
		options: [
			str('author', 'Author', '', 'Document author'),
			str('creationDate', 'Creation Date', '', 'Format yyyy/MM/dd HH:mm:ss'),
			str('creator', 'Creator', '', 'Creator application'),
			{
				displayName: 'Custom Metadata',
				name: 'allRequestParams',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				placeholder: 'Add Custom Field',
				options: [
					{
						name: 'entries',
						displayName: 'Entry',
						values: [
							{ displayName: 'Key', name: 'key', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
				description: 'Custom metadata entries to add or update',
			},
			str('keywords', 'Keywords', '', 'Document keywords'),
			str('modificationDate', 'Modification Date', '', 'Format yyyy/MM/dd HH:mm:ss'),
			str('producer', 'Producer', '', 'Producer application'),
			str('subject', 'Subject', '', 'Document subject'),
			str('title', 'Title', '', 'Document title'),
			pick(
				'trapped',
				'Trapped',
				[
					['False', 'False'],
					['True', 'True'],
					['Unknown', 'Unknown'],
				],
				'Unknown',
				'Trapped status',
			),
		],
	},
	{
		resource: 'content',
		value: 'extractImages',
		name: 'Extract Images',
		action: 'Extract images from a PDF',
		description: 'Extract all embedded images',
		endpoint: '/api/v1/misc/extract-images',
		input: 'file',
		fields: [
			pick(
				'format',
				'Image Format',
				[
					['GIF', 'gif'],
					['JPEG', 'jpeg'],
					['PNG', 'png'],
				],
				'png',
				'Format of the extracted images',
			),
		],
		options: [
			bool('allowDuplicates', 'Allow Duplicates', false, 'Whether to keep duplicate images'),
		],
	},
	{
		resource: 'content',
		value: 'removeImages',
		name: 'Remove Images',
		action: 'Remove images from a PDF',
		description: 'Remove all images from a PDF',
		endpoint: '/api/v1/general/remove-image-pdf',
		input: 'file',
	},
	{
		resource: 'content',
		value: 'flatten',
		name: 'Flatten',
		action: 'Flatten a PDF',
		description: 'Flatten form fields or whole pages',
		endpoint: '/api/v1/misc/flatten',
		input: 'file',
		fields: [
			bool(
				'flattenOnlyForms',
				'Flatten Only Forms',
				true,
				'Whether to flatten only form fields (false turns every page into an image)',
			),
		],
		options: [num('renderDpi', 'Render DPI', 300, 'DPI used when flattening full pages')],
	},
	{
		resource: 'content',
		value: 'unlockForms',
		name: 'Unlock Forms',
		action: 'Unlock read-only form fields',
		description: 'Remove the read-only flag from form fields',
		endpoint: '/api/v1/misc/unlock-pdf-forms',
		input: 'file',
	},

	// ======================================================== OPTIMIZE
	{
		resource: 'optimize',
		value: 'compress',
		name: 'Compress',
		action: 'Compress a PDF',
		description: 'Reduce the size of a PDF',
		endpoint: '/api/v1/misc/compress-pdf',
		input: 'file',
		fields: [
			num('optimizeLevel', 'Compression Level', 5, '1 (lightest) to 9 (strongest)', {
				typeOptions: { minValue: 1, maxValue: 9 },
			}),
		],
		options: [
			str(
				'expectedOutputSize',
				'Expected Output Size',
				'',
				"Target size like '2MB' or '500KB'; when set the level is chosen automatically",
			),
			bool('grayscale', 'Grayscale', false, 'Whether to convert the PDF to grayscale'),
			bool('linearize', 'Linearize', false, 'Whether to linearize the PDF for fast web view'),
			bool(
				'normalize',
				'Normalize',
				false,
				'Whether to normalize the PDF for better compatibility',
			),
		],
	},
	{
		resource: 'optimize',
		value: 'ocr',
		name: 'OCR',
		action: 'Run OCR on a PDF',
		description: 'Make scanned PDFs searchable with OCR',
		endpoint: '/api/v1/misc/ocr-pdf',
		input: 'file',
		fields: [
			str(
				'languages',
				'Languages',
				'eng',
				"Comma-separated Tesseract language codes, e.g. 'eng,ita,deu'",
			),
			pick(
				'ocrType',
				'OCR Type',
				[
					['Force OCR (Rasterize All Pages)', 'force-ocr'],
					['Normal', 'Normal'],
					['Skip Pages With Text', 'skip-text'],
				],
				'skip-text',
				'How to treat pages that already contain text',
			),
		],
		arrayFields: ['languages'],
		options: [
			bool('clean', 'Clean Input', false, 'Whether to clean the input before OCR'),
			bool('cleanFinal', 'Clean Final', false, 'Whether to clean the final output'),
			bool('deskew', 'Deskew', false, 'Whether to deskew pages'),
			pick(
				'ocrRenderType',
				'Render Type',
				[
					['HOCR', 'hocr'],
					['Sandwich', 'sandwich'],
				],
				'hocr',
				'OCR render type',
			),
			bool(
				'removeImagesAfter',
				'Remove Images After',
				false,
				'Whether to remove images from the output',
			),
			bool('rotatePages', 'Rotate Pages', false, 'Whether to auto-correct page orientation'),
			bool(
				'sidecar',
				'Sidecar Text File',
				false,
				'Whether to return the OCR text in a sidecar file (ZIP output)',
			),
		],
	},
	{
		resource: 'optimize',
		value: 'repair',
		name: 'Repair',
		action: 'Repair a PDF',
		description: 'Try to repair a corrupted PDF',
		endpoint: '/api/v1/misc/repair',
		input: 'file',
	},
	{
		resource: 'optimize',
		value: 'decompress',
		name: 'Decompress',
		action: 'Decompress a PDF',
		description: 'Decompress PDF streams (useful for debugging)',
		endpoint: '/api/v1/misc/decompress-pdf',
		input: 'file',
	},

	// ======================================================== CONVERT
	{
		resource: 'convert',
		value: 'pdfToImage',
		name: 'PDF to Image',
		action: 'Convert PDF to image',
		description: 'Render PDF pages as images',
		endpoint: '/api/v1/convert/pdf/img',
		input: 'file',
		fields: [
			pick(
				'imageFormat',
				'Image Format',
				[
					['GIF', 'gif'],
					['JPEG', 'jpeg'],
					['PNG', 'png'],
					['WebP', 'webp'],
				],
				'png',
				'Output image format',
			),
			pick(
				'singleOrMultiple',
				'Output',
				[
					['One Image per Page', 'multiple'],
					['Single Image (All Pages)', 'single'],
				],
				'multiple',
				'Whether to create one image per page or a single combined image',
			),
		],
		options: [
			pick('colorType', 'Color Type', COLOR_TYPES, 'color', 'Color mode of the images'),
			num('dpi', 'DPI', 300, 'Resolution of the images'),
			bool('includeAnnotations', 'Include Annotations', false, 'Whether to render annotations'),
			str('pageNumbers', 'Page Numbers', 'all', 'Pages to convert', { hint: PAGE_SELECTION_HINT }),
		],
	},
	{
		resource: 'convert',
		value: 'imageToPdf',
		name: 'Image to PDF',
		action: 'Convert images to PDF',
		description: 'Create a PDF from one or more images',
		endpoint: '/api/v1/convert/img/pdf',
		input: 'files',
		options: [
			bool('autoRotate', 'Auto Rotate', false, 'Whether to rotate images to better fit the page'),
			pick('colorType', 'Color Type', COLOR_TYPES, 'color', 'Color mode'),
			pick(
				'fitOption',
				'Fit Option',
				[
					['Fill Page', 'fillPage'],
					['Fit Document to Image', 'fitDocumentToImage'],
					['Fit Document to Page', 'fitDocumentToPage'],
					['Maintain Aspect Ratio', 'maintainAspectRatio'],
				],
				'fillPage',
				'How the image fits the page',
			),
		],
	},
	{
		resource: 'convert',
		value: 'fileToPdf',
		name: 'Office File to PDF',
		action: 'Convert an office file to PDF',
		description: 'Convert Word, Excel, PowerPoint, ODT, RTF, images… to PDF (LibreOffice)',
		endpoint: '/api/v1/convert/file/pdf',
		input: 'file',
	},
	{
		resource: 'convert',
		value: 'htmlToPdf',
		name: 'HTML to PDF',
		action: 'Convert HTML to PDF',
		description: 'Convert an HTML file (or ZIP with HTML and assets) to PDF',
		endpoint: '/api/v1/convert/html/pdf',
		input: 'file',
		options: [
			num('zoom', 'Zoom', 1, 'Zoom level used to render the page', {
				typeOptions: { numberPrecision: 2 },
			}),
		],
	},
	{
		resource: 'convert',
		value: 'urlToPdf',
		name: 'URL to PDF',
		action: 'Convert a web page to PDF',
		description: 'Render a web page as PDF',
		endpoint: '/api/v1/convert/url/pdf',
		input: 'url',
	},
	{
		resource: 'convert',
		value: 'markdownToPdf',
		name: 'Markdown to PDF',
		action: 'Convert markdown to PDF',
		description: 'Convert a Markdown file to PDF',
		endpoint: '/api/v1/convert/markdown/pdf',
		input: 'file',
	},
	{
		resource: 'convert',
		value: 'emlToPdf',
		name: 'Email to PDF',
		action: 'Convert an email to PDF',
		description: 'Convert an EML/MSG email to PDF',
		endpoint: '/api/v1/convert/eml/pdf',
		input: 'file',
		options: [
			bool(
				'includeAllRecipients',
				'Include All Recipients',
				true,
				'Whether to include CC and BCC recipients',
			),
			bool(
				'includeAttachments',
				'Include Attachments',
				false,
				'Whether to include email attachments',
			),
			num(
				'maxAttachmentSizeMB',
				'Max Attachment Size (MB)',
				10,
				'Maximum size of attachments to include',
			),
		],
	},
	{
		resource: 'convert',
		value: 'pdfToWord',
		name: 'PDF to Word',
		action: 'Convert PDF to word',
		description: 'Convert a PDF to a Word document',
		endpoint: '/api/v1/convert/pdf/word',
		input: 'file',
		fields: [
			pick(
				'outputFormat',
				'Output Format',
				[
					['DOC', 'doc'],
					['DOCX', 'docx'],
					['ODT', 'odt'],
				],
				'docx',
				'Output document format',
			),
		],
	},
	{
		resource: 'convert',
		value: 'pdfToPresentation',
		name: 'PDF to Presentation',
		action: 'Convert PDF to presentation',
		description: 'Convert a PDF to a PowerPoint or ODP presentation',
		endpoint: '/api/v1/convert/pdf/presentation',
		input: 'file',
		fields: [
			pick(
				'outputFormat',
				'Output Format',
				[
					['ODP', 'odp'],
					['PPT', 'ppt'],
					['PPTX', 'pptx'],
				],
				'pptx',
				'Output presentation format',
			),
		],
	},
	{
		resource: 'convert',
		value: 'pdfToText',
		name: 'PDF to Text',
		action: 'Convert PDF to text',
		description: 'Extract text from a PDF as TXT or RTF',
		endpoint: '/api/v1/convert/pdf/text',
		input: 'file',
		fields: [
			pick(
				'outputFormat',
				'Output Format',
				[
					['RTF', 'rtf'],
					['TXT', 'txt'],
				],
				'txt',
				'Output text format',
			),
		],
	},
	{
		resource: 'convert',
		value: 'pdfToMarkdown',
		name: 'PDF to Markdown',
		action: 'Convert PDF to markdown',
		description: 'Convert a PDF to Markdown',
		endpoint: '/api/v1/convert/pdf/markdown',
		input: 'file',
	},
	{
		resource: 'convert',
		value: 'pdfToHtml',
		name: 'PDF to HTML',
		action: 'Convert PDF to HTML',
		description: 'Convert a PDF to HTML',
		endpoint: '/api/v1/convert/pdf/html',
		input: 'file',
	},
	{
		resource: 'convert',
		value: 'pdfToXml',
		name: 'PDF to XML',
		action: 'Convert PDF to XML',
		description: 'Convert a PDF to XML',
		endpoint: '/api/v1/convert/pdf/xml',
		input: 'file',
	},
	{
		resource: 'convert',
		value: 'pdfToCsv',
		name: 'PDF to CSV',
		action: 'Extract tables as CSV',
		description: 'Extract tables from PDF pages as CSV',
		endpoint: '/api/v1/convert/pdf/csv',
		input: 'file',
		fields: [pageNumbers('Pages to extract tables from')],
	},
	{
		resource: 'convert',
		value: 'pdfToXlsx',
		name: 'PDF to Excel',
		action: 'Extract tables as excel',
		description: 'Extract tables from PDF pages as an XLSX workbook',
		endpoint: '/api/v1/convert/pdf/xlsx',
		input: 'file',
		fields: [pageNumbers('Pages to extract tables from')],
	},
	{
		resource: 'convert',
		value: 'pdfToPdfA',
		name: 'PDF to PDF/A',
		action: 'Convert PDF to PDF/A',
		description: 'Convert a PDF to PDF/A (archival) or PDF/X',
		endpoint: '/api/v1/convert/pdf/pdfa',
		input: 'file',
		skipDefaults: ['useStirlingOfficeConvert'],
		fields: [
			pick(
				'outputFormat',
				'Output Format',
				[
					['PDF/A-1a', 'pdfa-1a'],
					['PDF/A-1b', 'pdfa-1'],
					['PDF/A-2a', 'pdfa-2a'],
					['PDF/A-2b', 'pdfa'],
					['PDF/A-3a', 'pdfa-3a'],
					['PDF/A-3b', 'pdfa-3b'],
					['PDF/X', 'pdfx'],
				],
				'pdfa',
				'Target standard',
			),
		],
		options: [
			bool('strict', 'Strict', false, 'Whether to fail if the output is not perfectly compliant'),
			useOfficeConvert,
		],
	},

	// ======================================================== SECURITY
	{
		resource: 'security',
		value: 'addPassword',
		name: 'Add Password',
		action: 'Add a password to a PDF',
		description: 'Encrypt a PDF with a password and permissions',
		endpoint: '/api/v1/security/add-password',
		input: 'file',
		fields: [
			str('password', 'Password', '', 'Password required to open the document', {
				typeOptions: { password: true },
			}),
		],
		options: [
			pick(
				'keyLength',
				'Key Length',
				[
					['40 Bit', 40],
					['128 Bit', 128],
					['256 Bit', 256],
				],
				256,
				'Encryption key length',
			),
			str('ownerPassword', 'Owner Password', '', 'Password required to change permissions', {
				typeOptions: { password: true },
			}),
			bool('preventAssembly', 'Prevent Assembly', false, 'Whether to prevent document assembly'),
			bool(
				'preventExtractContent',
				'Prevent Content Extraction',
				false,
				'Whether to prevent content extraction',
			),
			bool(
				'preventExtractForAccessibility',
				'Prevent Extraction for Accessibility',
				false,
				'Whether to prevent extraction for accessibility',
			),
			bool('preventFillInForm', 'Prevent Form Filling', false, 'Whether to prevent form filling'),
			bool('preventModify', 'Prevent Modification', false, 'Whether to prevent modification'),
			bool(
				'preventModifyAnnotations',
				'Prevent Annotation Modification',
				false,
				'Whether to prevent annotation modification',
			),
			bool('preventPrinting', 'Prevent Printing', false, 'Whether to prevent printing'),
			bool(
				'preventPrintingFaithful',
				'Prevent Faithful Printing',
				false,
				'Whether to prevent high-quality printing',
			),
		],
	},
	{
		resource: 'security',
		value: 'removePassword',
		name: 'Remove Password',
		action: 'Remove the password from a PDF',
		description: 'Decrypt a password-protected PDF',
		endpoint: '/api/v1/security/remove-password',
		input: 'file',
		fields: [
			str('password', 'Password', '', 'Current password of the document', {
				typeOptions: { password: true },
			}),
		],
	},
	{
		resource: 'security',
		value: 'autoRedact',
		name: 'Auto Redact',
		action: 'Redact text in a PDF',
		description: 'Find and redact text (plain or regex)',
		endpoint: '/api/v1/security/auto-redact',
		input: 'file',
		fields: [
			str('listOfText', 'Text to Redact', '', 'One term per line', {
				typeOptions: { rows: 4 },
			}),
		],
		options: [
			bool('caseSensitive', 'Case Sensitive', false, 'Whether matching is case-sensitive'),
			bool(
				'convertPDFToImage',
				'Convert PDF to Image',
				true,
				'Whether to rasterize pages so the redacted text cannot be recovered',
			),
			num('customPadding', 'Padding', 0, 'Extra space around each redaction box, in points'),
			str('redactColor', 'Redaction Color', '#000000', 'Hex color of the redaction boxes'),
			bool('useRegex', 'Use Regex', false, 'Whether each line is a regular expression'),
			bool('wholeWordSearch', 'Whole Word', false, 'Whether to match whole words only'),
		],
	},
	{
		resource: 'security',
		value: 'sanitize',
		name: 'Sanitize',
		action: 'Sanitize a PDF',
		description: 'Remove JavaScript, embedded files, metadata, links or fonts',
		endpoint: '/api/v1/security/sanitize-pdf',
		input: 'file',
		options: [
			bool(
				'removeEmbeddedFiles',
				'Remove Embedded Files',
				true,
				'Whether to remove embedded files',
			),
			bool('removeFonts', 'Remove Fonts', false, 'Whether to remove fonts'),
			bool('removeJavaScript', 'Remove JavaScript', true, 'Whether to remove JavaScript'),
			bool('removeLinks', 'Remove Links', false, 'Whether to remove links'),
			bool('removeMetadata', 'Remove Metadata', false, 'Whether to remove document info metadata'),
			bool('removeXMPMetadata', 'Remove XMP Metadata', false, 'Whether to remove XMP metadata'),
		],
	},
	{
		resource: 'security',
		value: 'removeCertSign',
		name: 'Remove Certificate Signature',
		action: 'Remove digital signatures',
		description: 'Remove digital certificate signatures',
		endpoint: '/api/v1/security/remove-cert-sign',
		input: 'file',
	},
	{
		resource: 'security',
		value: 'getInfo',
		name: 'Get Full Info',
		action: 'Get full information on a PDF',
		description: 'Return detailed information (metadata, security, pages…) as JSON',
		endpoint: '/api/v1/security/get-info-on-pdf',
		input: 'file',
		jsonResponse: true,
	},
	{
		resource: 'security',
		value: 'showJavascript',
		name: 'Show JavaScript',
		action: 'Show embedded javascript',
		description: 'Return the JavaScript embedded in a PDF',
		endpoint: '/api/v1/misc/show-javascript',
		input: 'file',
	},
];

// ======================================================== ANALYSIS (all JSON)
const analysisOps: Array<[string, string, string]> = [
	['annotationInfo', 'Get Annotation Info', 'annotation-info'],
	['basicInfo', 'Get Basic Info', 'basic-info'],
	['documentProperties', 'Get Document Properties', 'document-properties'],
	['fontInfo', 'Get Font Info', 'font-info'],
	['formFields', 'Get Form Fields', 'form-fields'],
	['pageCount', 'Get Page Count', 'page-count'],
	['pageDimensions', 'Get Page Dimensions', 'page-dimensions'],
	['securityInfo', 'Get Security Info', 'security-info'],
];

for (const [value, name, path] of analysisOps) {
	operations.push({
		resource: 'analysis',
		value,
		name,
		action: `${name.charAt(0)}${name.slice(1).toLowerCase()}`,
		description: `${name.replace(/^Get /, '')} of a PDF`,
		endpoint: `/api/v1/analysis/${path}`,
		input: 'file',
		jsonResponse: true,
	});
}

export function findOperation(resource: string, operation: string): OperationDef | undefined {
	return operations.find((o) => o.resource === resource && o.value === operation);
}
