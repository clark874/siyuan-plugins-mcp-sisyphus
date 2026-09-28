import type { LiteratureAction } from '../../core/config';
import { ensurePermissionForDocumentId } from '../internal/context';
import { filterItemsByPermission } from '../search/permission-filter';
import { queryDocumentCitations } from './citations';
import { locateMarkdownQuote } from './source-locator';
import {
    compareZoteroToolContracts,
    readZoteroHttpStatus,
    ZoteroMcpClient,
} from '../../core/zotero-mcp-client';
import { defineTool } from '../internal/define-tool';
import { createJsonResult, createZodActionVariant, type ActionVariant } from '../internal/shared';
import {
    LiteratureActionSchema,
    LiteratureGetAnnotationsSchema,
    LiteratureGetCitationsSchema,
    LiteratureGetPaperSchema,
    LiteratureListCollectionItemsSchema,
    LiteratureListCollectionsSchema,
    LiteratureLocateQuoteSchema,
    LiteratureSearchPapersSchema,
    LiteratureStatusSchema,
} from './schemas';

export const LITERATURE_TOOL_NAME = 'literature';

export const LITERATURE_VARIANTS: ActionVariant<LiteratureAction>[] = [
    createZodActionVariant('status', LiteratureStatusSchema, 'Check the local Zotero source and detect upstream MCP contract drift.'),
    createZodActionVariant('list_collections', LiteratureListCollectionsSchema, 'List Zotero collections without exposing local attachment paths.'),
    createZodActionVariant('list_collection_items', LiteratureListCollectionItemsSchema, 'List papers in one Zotero collection.'),
    createZodActionVariant('search_papers', LiteratureSearchPapersSchema, 'Search bibliographic metadata and optionally attachment full text.'),
    createZodActionVariant('get_paper', LiteratureGetPaperSchema, 'Read paper metadata and bounded full text by Zotero item key.'),
    createZodActionVariant('get_citations', LiteratureGetCitationsSchema, 'List all indexed citations to a SiYuan paper document and its source blocks.'),
    createZodActionVariant('locate_quote', LiteratureLocateQuoteSchema, 'Locate exact evidence in a Zotero Markdown attachment.'),
    createZodActionVariant('get_annotations', LiteratureGetAnnotationsSchema, 'Read one paper\'s annotations or search annotations across the library.'),
];

function withLibraryId(libraryId: number | undefined): Record<string, unknown> {
    return libraryId === undefined ? {} : { libraryID: libraryId };
}

const literatureTool = defineTool<LiteratureAction>({
    name: LITERATURE_TOOL_NAME,
    description: '📚 Read Zotero papers, locate Markdown evidence, and inspect SiYuan citations through one bounded gateway.',
    variants: LITERATURE_VARIANTS,
    actionSchema: LiteratureActionSchema,
    aggregateOptions: {
        guidance: [
            'Requires the local Zotero application and its MCP plugin on 127.0.0.1:23120.',
            'Only a fixed read-only upstream allowlist is reachable; mutation and semantic-index actions are not exposed.',
        ],
    },
    handlers: {
        status: async ({ rawArgs }) => {
            LiteratureStatusSchema.parse(rawArgs);
            try {
                const client = new ZoteroMcpClient();
                const initialize = await client.initialize();
                const [formalTools, httpStatus, libraries] = await Promise.all([
                    client.listTools(),
                    readZoteroHttpStatus(),
                    client.callTool('get_libraries', { limit: 100, offset: 0 }),
                ]);
                const contracts = compareZoteroToolContracts(formalTools, httpStatus.availableTools);
                let semantic: unknown = { available: false };
                if (formalTools.includes('semantic_status')) {
                    try {
                        semantic = await client.callTool('semantic_status');
                    } catch (error) {
                        semantic = { available: true, error: error instanceof Error ? error.message : String(error) };
                    }
                }
                return createJsonResult({
                    connected: true,
                    source: 'zotero-mcp',
                    endpoint: 'http://127.0.0.1:23120/mcp',
                    serverInfo: initialize.serverInfo ?? httpStatus.serverInfo ?? null,
                    protocolVersion: initialize.protocolVersion ?? httpStatus.protocolVersion ?? null,
                    libraries,
                    capabilities: {
                        exposedActions: ['list_collections', 'list_collection_items', 'search_papers', 'get_paper', 'get_citations', 'locate_quote', 'get_annotations'],
                        upstreamReadAllowlist: formalTools.filter((name) => [
                            'get_libraries', 'get_collections', 'get_collection_items', 'search_library',
                            'get_item_details', 'get_content', 'search_annotations', 'get_annotations',
                        ].includes(name)),
                        semantic,
                    },
                    contract: {
                        healthy: contracts.missingRequired.length === 0,
                        driftDetected: contracts.advertisedOnly.length > 0 || contracts.formalOnly.length > 0,
                        ...contracts,
                    },
                });
            } catch (error) {
                return createJsonResult({
                    connected: false,
                    source: 'zotero-mcp',
                    endpoint: 'http://127.0.0.1:23120/mcp',
                    error: error instanceof Error ? error.message : String(error),
                    nextStep: '启动 Zotero，并确认 Zotero MCP 插件正在监听 23120 端口。',
                });
            }
        },
        list_collections: async ({ rawArgs }) => {
            const parsed = LiteratureListCollectionsSchema.parse(rawArgs);
            const client = new ZoteroMcpClient();
            return createJsonResult(await client.callTool('get_collections', {
                ...withLibraryId(parsed.libraryId),
                recursive: parsed.recursive ?? true,
                ...(parsed.parentCollection ? { parentCollection: parsed.parentCollection } : {}),
                ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
                ...(parsed.offset !== undefined ? { offset: parsed.offset } : {}),
            }));
        },
        list_collection_items: async ({ rawArgs }) => {
            const parsed = LiteratureListCollectionItemsSchema.parse(rawArgs);
            const client = new ZoteroMcpClient();
            return createJsonResult(await client.callTool('get_collection_items', {
                ...withLibraryId(parsed.libraryId),
                collectionKey: parsed.collectionKey,
                limit: parsed.limit ?? 50,
                offset: parsed.offset ?? 0,
            }));
        },
        search_papers: async ({ rawArgs }) => {
            const parsed = LiteratureSearchPapersSchema.parse(rawArgs);
            const client = new ZoteroMcpClient();
            return createJsonResult(await client.callTool('search_library', {
                ...withLibraryId(parsed.libraryId),
                q: parsed.query,
                ...(parsed.yearRange ? { yearRange: parsed.yearRange } : {}),
                ...(parsed.fulltext ? { fulltext: parsed.fulltext } : {}),
                ...(parsed.itemType ? { itemType: parsed.itemType } : {}),
                mode: parsed.mode ?? 'standard',
                sort: parsed.sort ?? 'relevance',
                relevanceScoring: true,
                limit: parsed.limit ?? 20,
                offset: parsed.offset ?? 0,
            }));
        },
        get_paper: async ({ rawArgs }) => {
            const parsed = LiteratureGetPaperSchema.parse(rawArgs);
            const client = new ZoteroMcpClient();
            const metadata = await client.callTool('get_item_details', {
                ...withLibraryId(parsed.libraryId),
                itemKey: parsed.itemKey,
                mode: parsed.mode ?? 'standard',
            });
            const content = parsed.includeContent === false
                ? undefined
                : await client.callTool('get_content', {
                    ...withLibraryId(parsed.libraryId),
                    itemKey: parsed.itemKey,
                    mode: parsed.contentMode ?? 'standard',
                    format: 'json',
                });
            return createJsonResult({ itemKey: parsed.itemKey, metadata, ...(content === undefined ? {} : { content }) });
        },
        get_citations: async ({ client, permMgr, rawArgs }) => {
            const parsed = LiteratureGetCitationsSchema.parse(rawArgs);
            const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.documentId, 'read');
            if (denied) return denied;
            const limit = parsed.limit ?? 50;
            const offset = parsed.offset ?? 0;
            const indexed = await queryDocumentCitations(client, parsed.documentId, limit, offset, parsed.sourceDocumentId);
            const filtered = await filterItemsByPermission(client, indexed.rows, permMgr);
            const citations = filtered.items;
            const sourceDocuments = [...new Set(citations.flatMap((row) => {
                const id = row && typeof row === 'object' ? (row as Record<string, unknown>).sourceDocumentId : undefined;
                return typeof id === 'string' ? [id] : [];
            }))];
            return createJsonResult({
                documentId: parsed.documentId,
                citations,
                sourceDocuments,
                returnedEdges: citations.length,
                limit,
                offset,
                ...(filtered.removedCount > 0 ? { partial: true, filteredOutCount: filtered.removedCount } : { hasMore: indexed.hasMore }),
                ...(indexed.kernelTruncated ? { kernelTruncated: true } : {}),
                source: 'siyuan_refs_index',
            });
        },
        locate_quote: async ({ rawArgs }) => {
            const parsed = LiteratureLocateQuoteSchema.parse(rawArgs);
            return createJsonResult(await locateMarkdownQuote(new ZoteroMcpClient(), {
                itemKey: parsed.itemKey,
                ...(parsed.attachmentKey ? { attachmentKey: parsed.attachmentKey } : {}),
                ...(parsed.libraryId !== undefined ? { libraryID: parsed.libraryId } : {}),
                quote: parsed.quote,
                contextChars: parsed.contextChars ?? 160,
            }));
        },
        get_annotations: async ({ rawArgs }) => {
            const parsed = LiteratureGetAnnotationsSchema.parse(rawArgs);
            const client = new ZoteroMcpClient();
            const filters = {
                ...withLibraryId(parsed.libraryId),
                ...(parsed.types ? { types: parsed.types } : {}),
                ...(parsed.colors ? { colors: parsed.colors } : {}),
                ...(parsed.tags ? { tags: parsed.tags } : {}),
                mode: parsed.mode ?? 'standard',
                ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {}),
                limit: parsed.limit ?? 20,
                offset: parsed.offset ?? 0,
            };
            return createJsonResult(parsed.itemKey
                ? await client.callTool('get_annotations', { ...filters, itemKey: parsed.itemKey })
                : await client.callTool('search_annotations', { ...filters, q: parsed.query }));
        },
    },
});

export const listLiteratureTools = literatureTool.listTools;
export const callLiteratureTool = literatureTool.callTool;
