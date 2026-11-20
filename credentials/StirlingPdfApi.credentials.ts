import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class StirlingPdfApi implements ICredentialType {
	name = 'stirlingPdfApi';

	displayName = 'Stirling-PDF API';

	icon: Icon = {
		light: 'file:../nodes/StirlingPdf/stirlingPdf.svg',
		dark: 'file:../nodes/StirlingPdf/stirlingPdf.dark.svg',
	};

	documentationUrl = 'https://docs.stirlingpdf.com/API';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://localhost:8080',
			placeholder: 'https://pdf.example.com',
			description: 'URL of your Stirling-PDF instance, without trailing slash and without /api',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'API key of a Stirling-PDF user (Account settings → API key). Leave empty if security/login is disabled on your instance.',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description: 'Whether to connect even if SSL certificate validation is not possible',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-KEY': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			// Requires authentication when login is enabled, so it validates the API key
			url: '/api/v1/config/endpoints-enabled',
			method: 'GET',
			skipSslCertificateValidation: '={{$credentials.ignoreSslIssues}}',
		},
	};
}
