import { z } from 'zod';

import { LITERATURE_ACTIONS } from '../../core/config';

const ModeSchema = z.enum(['minimal', 'preview', 'standard', 'complete']);
const LibraryIdSchema = z.number().int().positive().optional().describe('Zotero library ID; omit for the user library');
const PaginationShape = {
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().min(0).optional(),
};

export const LiteratureActionSchema = z.enum(LITERATURE_ACTIONS);

export const LiteratureStatusSchema = z.object({
    action: z.literal('status'),
}).strict();

export const LiteratureListCollectionsSchema = z.object({
    action: z.literal('list_collections'),
    libraryId: LibraryIdSchema,
    recursive: z.boolean().optional().describe('Return the complete nested tree; defaults to true'),
    parentCollection: z.string().min(1).optional(),
    ...PaginationShape,
}).strict();

export const LiteratureListCollectionItemsSchema = z.object({
    action: z.literal('list_collection_items'),
    collectionKey: z.string().min(1),
    libraryId: LibraryIdSchema,
    ...PaginationShape,
}).strict();

export const LiteratureSearchPapersSchema = z.object({
    action: z.literal('search_papers'),
    query: z.string().trim().min(1).describe('Title, author, identifier, keyword, or other bibliographic query'),
    libraryId: LibraryIdSchema,
    yearRange: z.string().trim().min(1).optional().describe('Year or range such as 2020-2024'),
    fulltext: z.string().trim().min(1).optional().describe('Optional attachment or note full-text query'),
    itemType: z.string().trim().min(1).optional(),
    sort: z.enum(['relevance', 'date', 'title', 'year']).optional(),
    mode: ModeSchema.optional(),
    ...PaginationShape,
}).strict();

export const LiteratureGetPaperSchema = z.object({
    action: z.literal('get_paper'),
    itemKey: z.string().trim().min(1),
    libraryId: LibraryIdSchema,
    mode: ModeSchema.optional().describe('Metadata detail level'),
    includeContent: z.boolean().optional().describe('Include bounded full text; defaults to true'),
    contentMode: ModeSchema.optional().describe('Full-text detail level; defaults to standard'),
}).strict();

export const LiteratureGetCitationsSchema = z.object({
    action: z.literal('get_citations'),
    documentId: z.string().trim().min(1).describe('SiYuan paper document ID; includes references to its child blocks'),
    sourceDocumentId: z.string().trim().min(1).optional().describe('Optional citing document ID'),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
}).strict();

export const LiteratureLocateQuoteSchema = z.object({
    action: z.literal('locate_quote'),
    itemKey: z.string().trim().min(1),
    attachmentKey: z.string().trim().min(1).optional(),
    libraryId: LibraryIdSchema,
    quote: z.string().min(5).max(1000).describe('Exact text to locate in an attached Markdown source'),
    contextChars: z.number().int().min(0).max(500).optional(),
}).strict();

export const LiteratureGetAnnotationsSchema = z.object({
    action: z.literal('get_annotations'),
    itemKey: z.string().trim().min(1).optional(),
    query: z.string().trim().min(1).optional(),
    libraryId: LibraryIdSchema,
    types: z.array(z.enum(['note', 'highlight', 'annotation', 'ink', 'text', 'image'])).min(1).optional(),
    colors: z.array(z.string().min(1)).min(1).optional(),
    tags: z.array(z.string().min(1)).min(1).optional(),
    mode: ModeSchema.optional(),
    maxTokens: z.number().int().min(1).max(100_000).optional(),
    ...PaginationShape,
}).strict().superRefine((value, ctx) => {
    if (Boolean(value.itemKey) === Boolean(value.query)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide exactly one of itemKey or query.',
        });
    }
});
