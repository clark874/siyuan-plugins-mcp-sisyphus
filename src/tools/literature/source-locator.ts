import { createHash } from 'node:crypto';

import { ZoteroMcpClient } from '../../core/zotero-mcp-client';

type PaperAttachment = {
    key?: string;
    contentType?: string;
    filename?: string;
};

type PaperMetadata = {
    zoteroUrl?: string;
    attachments?: PaperAttachment[];
};

type MarkdownContent = {
    content?: string;
    contentType?: string;
    truncated?: boolean;
    filename?: string;
};

export async function locateMarkdownQuote(
    client: ZoteroMcpClient,
    input: { itemKey: string; attachmentKey?: string; quote: string; libraryID?: number; contextChars: number },
): Promise<Record<string, unknown>> {
    const library = input.libraryID === undefined ? {} : { libraryID: input.libraryID };
    const metadata = await client.callTool('get_item_details', {
        ...library,
        itemKey: input.itemKey,
        mode: 'complete',
    }) as PaperMetadata;
    const markdownAttachments = (metadata.attachments ?? [])
        .filter((attachment) => attachment.contentType === 'text/markdown' && typeof attachment.key === 'string');
    const attachment = input.attachmentKey
        ? markdownAttachments.find((candidate) => candidate.key === input.attachmentKey)
        : markdownAttachments.length === 1 ? markdownAttachments[0] : undefined;
    if (!attachment?.key) {
        return {
            itemKey: input.itemKey,
            status: markdownAttachments.length === 0 ? 'no_markdown_attachment' : 'select_markdown_attachment',
            availableAttachments: markdownAttachments.map(({ key, filename }) => ({ key, filename })),
        };
    }

    const source = await client.callTool('get_content', {
        ...library,
        attachmentKey: attachment.key,
        mode: 'complete',
        format: 'json',
        contentControl: { preserveOriginal: true },
    }) as MarkdownContent;
    if (source.contentType !== 'text/markdown' || source.truncated || typeof source.content !== 'string') {
        return { itemKey: input.itemKey, attachmentKey: attachment.key, status: 'source_not_verifiable' };
    }

    const content = source.content;
    const matches: Array<Record<string, unknown>> = [];
    let occurrenceCount = 0;
    let cursor = 0;
    while ((cursor = content.indexOf(input.quote, cursor)) !== -1) {
        occurrenceCount += 1;
        if (matches.length < 5) {
            const preceding = content.slice(0, cursor);
            const lineStart = preceding.split('\n').length;
            const headings = [...preceding.matchAll(/^#{1,6}\s+(.+)$/gm)];
            matches.push({
                lineStart,
                lineEnd: lineStart + input.quote.split('\n').length - 1,
                heading: headings.at(-1)?.[1] ?? null,
                before: content.slice(Math.max(0, cursor - input.contextChars), cursor),
                quote: input.quote,
                after: content.slice(cursor + input.quote.length, cursor + input.quote.length + input.contextChars),
            });
        }
        cursor += input.quote.length;
    }
    return {
        itemKey: input.itemKey,
        attachmentKey: attachment.key,
        filename: source.filename ?? attachment.filename ?? null,
        zoteroUrl: metadata.zoteroUrl ?? null,
        sha256: createHash('sha256').update(content).digest('hex'),
        status: occurrenceCount === 0 ? 'quote_not_found' : occurrenceCount === 1 ? 'located' : 'ambiguous_quote',
        occurrenceCount,
        matches,
    };
}
