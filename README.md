# @marcostoduto/n8n-nodes-stirling-pdf

An [n8n](https://n8n.io) community node for [Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF), the self-hosted PDF toolkit.
Use it to merge, split, convert, compress, OCR, watermark, secure and analyze PDFs in your workflows.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Usage](#usage) · [Development](#development)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n docs.

In n8n, go to **Settings → Community Nodes → Install** and enter:

```
@marcostoduto/n8n-nodes-stirling-pdf
```

For a self-hosted n8n running in Docker you can also install it manually:

```bash
cd ~/.n8n/nodes && npm install @marcostoduto/n8n-nodes-stirling-pdf
```

## Credentials

Create a **Stirling-PDF API** credential:

| Field                 | Description                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Base URL**          | URL of your instance, e.g. `http://stirling-pdf:8080` (no trailing `/api`)                                                                                |
| **API Key**           | Your Stirling-PDF user's API key (_Account settings → API key_). Leave empty if login is disabled on your instance. It is sent in the `X-API-KEY` header. |
| **Ignore SSL Issues** | Accept self-signed certificates                                                                                                                           |

The credential test calls `GET /api/v1/config/endpoints-enabled`.

## Operations

| Resource            | Operations                                                                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Page**            | Auto Rotate, Auto Split (Divider Pages), Convert to Single Page, Merge, Multi-Page Layout, Rearrange Pages, Remove Blank Pages, Remove Pages, Rotate, Scale Pages, Split, Split by Chapters, Split by Size or Count                     |
| **Content**         | Add Image, Add Page Numbers, Add Stamp (text, image or QR code), Add Watermark, Extract Images, Flatten, Remove Images, Unlock Forms, Update Metadata                                                                                   |
| **Optimization**    | Compress, Decompress, OCR, Repair                                                                                                                                                                                                       |
| **Conversion**      | Email to PDF, HTML to PDF, Image to PDF, Markdown to PDF, Office File to PDF, PDF to CSV, PDF to Excel, PDF to HTML, PDF to Image, PDF to Markdown, PDF to PDF/A, PDF to Presentation, PDF to Text, PDF to Word, PDF to XML, URL to PDF |
| **Security**        | Add Password, Auto Redact, Get Full Info, Remove Certificate Signature, Remove Password, Sanitize, Show JavaScript                                                                                                                      |
| **Analysis**        | Get Annotation Info, Get Basic Info, Get Document Properties, Get Font Info, Get Form Fields, Get Page Count, Get Page Dimensions, Get Security Info                                                                                    |
| **Custom API Call** | Call any Stirling-PDF endpoint (GET/POST) with your own files and form parameters                                                                                                                                                       |

The full API of your instance is documented at `https://<your-instance>/swagger-ui/index.html`.
Use **Custom API Call** for endpoints the node does not cover yet.

## Usage

### Input files

Most operations read the file from a binary field of the input item (default `data`). For example, it can come from a _Read/Write Files from Disk_, _HTTP Request_, _Google Drive_ or _Email trigger_ node.

**Merge** and **Image to PDF** accept several files:

- **All Items Combined** (default): the files of all input items are sent in one request, and the node returns one item.
- **Each Item Separately**: one request per item, using the comma-separated binary fields of that item (e.g. `data,attachment_1`).

Fields such as _Stamp Image_, _Watermark Image_ and _Add Image_ take the name of another binary field of the same item (default `image`).

### Output

- File results are returned as binary data in `data`. You can rename the field with **Options → Output Binary Field** and override the file name with **Output File Name**.
- ZIP responses are unpacked into **one item per file** by default. This applies to split results, PDF to Image with one image per page, extracted images and similar operations. Turn off **Options → Extract ZIP Results** to keep the archive.
- JSON responses (Analysis, Get Full Info, Auto Rotate dry run, …) are returned as the item's JSON.

### Page selection syntax

Fields like _Page Numbers_ accept `all`, lists and ranges (`1,3,5-9`), or functions such as `2n+1` (odd pages) and `2n` (even pages).

### Example: OCR every PDF in an email and merge it

`Email Trigger (IMAP)` → `Stirling-PDF: Optimization → OCR` → `Stirling-PDF: Page → Merge (All Items Combined)` → `Google Drive: Upload`

## Compatibility

- Built against the current Stirling-PDF API (`/api/v1/...`, v1.x/v2.x). Most endpoints have kept their path since 0.2x, but some parameters may differ in older releases.
- Requires n8n 1.x or later with Node.js 18+.
- No runtime dependencies (n8n Cloud compatible lint rules).

## Development

```bash
npm install
npm run build
npm run lint
npm run dev   # starts n8n with the node loaded and hot reload
```

## Releasing

Releases are published to npm by GitHub Actions (`.github/workflows/publish.yml`) with npm provenance, which n8n requires for community node verification.

1. **First release only**: create an npm granular access token with publish rights and save it as the `NPM_TOKEN` repository secret (GitHub → Settings → Secrets and variables → Actions). After the package exists on npm you can switch to [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (workflow `publish.yml`) and delete the secret.
2. On an up-to-date `main` branch run:

   ```bash
   npm run release
   ```

   This lints, builds, bumps the version, updates the changelog, then commits, tags and pushes. The pushed tag (e.g. `0.1.1`) triggers the publish workflow.

To publish the current version as is, push a tag that matches `package.json`, for example `git tag 0.1.0 && git push origin 0.1.0`.

## Resources

- [Stirling-PDF documentation](https://docs.stirlingpdf.com)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
