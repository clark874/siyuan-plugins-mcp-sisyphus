import type { SiYuanClient } from '../api/client';
import * as attributeApi from '../api/block';
import * as flashcardApi from '../api/flashcard';
import type { FlashcardAction } from '../core/config';
import { FLASHCARD_ACTION_HINTS, FLASHCARD_GUIDANCE } from '../core/help';
import {
    FlashcardActionSchema,
    FlashcardAddCardSchema,
    FlashcardCreateCardSchema,
    FlashcardGetCardsSchema,
    FlashcardGetDecksSchema,
    FlashcardListCardsSchema,
    FlashcardRemoveCardSchema,
    FlashcardReviewCardSchema,
    FlashcardSkipReviewCardSchema,
} from '../core/types';
import { defineTool } from './define-tool';
import { createActionSchema, createJsonResult, type ActionVariant } from './shared';

export const FLASHCARD_TOOL_NAME = 'flashcard';
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';
const NODE_ATTR_RIFF_DECKS = 'custom-riff-decks';
const BUILTIN_DECK_NAME = 'Built-in Deck';
const GET_CARDS_RETRY_ATTEMPTS = 5;
const GET_CARDS_RETRY_DELAY_MS = 300;
const FLASHCARD_BINDING_VERIFY_ATTEMPTS = 6;
const FLASHCARD_BINDING_VERIFY_DELAY_MS = 300;

type BlockAttrMap = Record<string, string>;

export const FLASHCARD_VARIANTS: ActionVariant<FlashcardAction>[] = [
    {
        action: 'list_cards',
        schema: createActionSchema('list_cards', {
            scope: { type: 'string', enum: ['all', 'deck', 'notebook', 'tree'], description: 'Query scope' },
            filter: { type: 'string', enum: ['due', 'new', 'old'], description: 'Card filter by review state' },
            deckID: { type: 'string', description: 'Deck ID, required when scope=deck' },
            notebook: { type: 'string', description: 'Notebook ID, required when scope=notebook' },
            rootID: { type: 'string', description: 'Root document/block ID, required when scope=tree' },
        }, ['scope', 'filter'], 'List due flashcards and optionally filter to new/old cards.'),
    },
    {
        action: 'get_decks',
        schema: createActionSchema('get_decks', {}, [], 'Get flashcard deck definitions.'),
    },
    {
        action: 'get_cards',
        schema: createActionSchema('get_cards', {
            deckID: { type: 'string', description: 'Deck ID (use empty string to query across all decks)' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Cards per page, default 32, max 512' },
        }, ['deckID'], 'List all cards in a deck with pagination (not limited to due cards).'),
    },
    {
        action: 'review_card',
        schema: createActionSchema('review_card', {
            deckID: { type: 'string', description: 'Deck ID' },
            cardID: { type: 'string', description: 'Card ID' },
            rating: { type: 'number', description: 'Review rating passed through to the kernel' },
            reviewedCards: { type: 'array', items: { type: 'object' }, description: 'Optional reviewedCards payload passed through to the kernel' },
        }, ['deckID', 'cardID', 'rating'], 'Submit a review result for one flashcard.'),
    },
    {
        action: 'skip_review_card',
        schema: createActionSchema('skip_review_card', {
            deckID: { type: 'string', description: 'Deck ID' },
            cardID: { type: 'string', description: 'Card ID' },
        }, ['deckID', 'cardID'], 'Skip the current flashcard in a review flow.'),
    },
    {
        action: 'create_card',
        schema: createActionSchema('create_card', {
            deckID: { type: 'string', description: 'Deck ID' },
            blockIDs: { type: 'array', items: { type: 'string' }, description: 'Existing block IDs to turn into flashcards' },
        }, ['deckID', 'blockIDs'], 'Turn existing blocks into flashcards by writing deck attrs and registering riff cards.'),
    },
    {
        action: 'add_card',
        schema: createActionSchema('add_card', {
            deckID: { type: 'string', description: 'Deck ID' },
            blockIDs: { type: 'array', items: { type: 'string' }, description: 'Existing block IDs to add as flashcards' },
        }, ['deckID', 'blockIDs'], 'Add existing blocks to a flashcard deck.'),
    },
    {
        action: 'remove_card',
        schema: createActionSchema('remove_card', {
            deckID: { type: 'string', description: 'Deck ID' },
            blockIDs: { type: 'array', items: { type: 'string' }, description: 'Existing block IDs to remove from a flashcard deck' },
        }, ['deckID', 'blockIDs'], 'Remove existing blocks from a flashcard deck.'),
    },
];

function isNewCardState(state: unknown): boolean {
    if (typeof state === 'string') {
        return ['new', '0'].includes(state.toLowerCase());
    }
    return state === 0;
}

function isOldCardState(state: unknown): boolean {
    if (typeof state === 'string') {
        return ['old', '1', 'review'].includes(state.toLowerCase());
    }
    return state === 1;
}

function filterCardsByState(cards: flashcardApi.Flashcard[], filter: 'due' | 'new' | 'old') {
    if (filter === 'due') return cards;
    if (filter === 'new') return cards.filter(card => isNewCardState(card.state));
    return cards.filter(card => isOldCardState(card.state));
}

function normalizeWritableDeckID(deckID: string): string {
    return deckID === '' ? BUILTIN_DECK_ID : deckID;
}

function normalizeDeckBinding(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

async function getBlockAttrsSafe(client: SiYuanClient, blockID: string): Promise<BlockAttrMap> {
    const attrs = await attributeApi.getBlockAttrs(client, blockID);
    return attrs && typeof attrs === 'object' ? attrs : {};
}

async function ensureFlashcardTargetsWritable(client: SiYuanClient, blockIDs: string[]): Promise<void> {
    for (const blockID of blockIDs) {
        const attrs = await getBlockAttrsSafe(client, blockID);
        if (attrs.type === 'doc') {
            throw new Error(`Block "${blockID}" is a document block and cannot be turned into a flashcard. Pass a content block ID such as a paragraph or heading instead.`);
        }
    }
}

function mergeDeckBinding(value: string | undefined, deckID: string): string {
    const deckIDs = normalizeDeckBinding(value);
    if (!deckIDs.includes(deckID)) deckIDs.push(deckID);
    return deckIDs.join(',');
}

async function bindBlocksToDeck(client: SiYuanClient, blockIDs: string[], deckID: string): Promise<void> {
    for (const blockID of blockIDs) {
        const attrs = await getBlockAttrsSafe(client, blockID);
        await attributeApi.setBlockAttrs(client, blockID, {
            [NODE_ATTR_RIFF_DECKS]: mergeDeckBinding(attrs[NODE_ATTR_RIFF_DECKS], deckID),
        });
    }
}

async function verifyFlashcardBindings(client: SiYuanClient, blockIDs: string[], deckID: string, action: 'create_card' | 'add_card'): Promise<void> {
    for (const blockID of blockIDs) {
        const attrs = await getBlockAttrsSafe(client, blockID);
        const deckIDs = normalizeDeckBinding(attrs[NODE_ATTR_RIFF_DECKS]);
        if (!deckIDs.includes(deckID)) {
            throw new Error(`flashcard/${action} did not persist a valid deck binding for block "${blockID}". Expected ${NODE_ATTR_RIFF_DECKS} to include "${deckID}".`);
        }
    }
}

function extractFlashcardBlockResultEntries(result: { blocks?: flashcardApi.Flashcard[] } | null | undefined): flashcardApi.Flashcard[] {
    return Array.isArray(result?.blocks) ? result.blocks : [];
}

function getFlashcardResultBlockID(card: flashcardApi.Flashcard): string | undefined {
    return typeof card.id === 'string' && card.id.length > 0
        ? card.id
        : typeof card.blockID === 'string' && card.blockID.length > 0
            ? card.blockID
            : undefined;
}

function hasResolvedRiffCard(card: flashcardApi.Flashcard | undefined): boolean {
    if (!card || typeof card !== 'object') return false;
    if (typeof card.riffCardID === 'string' && card.riffCardID.length > 0) return true;
    return Boolean(card.riffCard);
}

async function verifyFlashcardDeckRecords(
    client: SiYuanClient,
    blockIDs: string[],
    mode: 'present' | 'absent',
    action: 'create_card' | 'add_card' | 'remove_card',
): Promise<void> {
    const expected = new Set(blockIDs);
    for (let attempt = 0; attempt < FLASHCARD_BINDING_VERIFY_ATTEMPTS; attempt += 1) {
        const response = await flashcardApi.getRiffCardsByBlockIDs(client, blockIDs);
        const byBlockID = new Map<string, flashcardApi.Flashcard>();
        for (const card of extractFlashcardBlockResultEntries(response)) {
            const blockID = getFlashcardResultBlockID(card);
            if (blockID) byBlockID.set(blockID, card);
        }

        const satisfied = [...expected].every((blockID) => {
            const card = byBlockID.get(blockID);
            return mode === 'present' ? hasResolvedRiffCard(card) : !hasResolvedRiffCard(card);
        });
        if (satisfied) return;

        if (attempt < FLASHCARD_BINDING_VERIFY_ATTEMPTS - 1) {
            await sleep(FLASHCARD_BINDING_VERIFY_DELAY_MS);
        }
    }

    throw new Error(
        mode === 'present'
            ? `flashcard/${action} did not create readable riff card records for blocks: ${blockIDs.join(', ')}`
            : `flashcard/${action} did not fully remove readable riff card records for blocks: ${blockIDs.join(', ')}`,
    );
}

function normalizeGetCardsResult(result: flashcardApi.FlashcardGetCardsResult | null | undefined): flashcardApi.Flashcard[] {
    if (Array.isArray(result?.blocks)) return result.blocks;
    if (Array.isArray(result?.cards)) return result.cards;
    return [];
}

function isUnresolvedFlashcardBlock(card: flashcardApi.Flashcard): boolean {
    return (!card.type || card.type === '')
        && typeof card.content === 'string'
        && card.content.includes('不存在符合条件的内容块');
}

function needsGetCardsRetry(cards: flashcardApi.Flashcard[]): boolean {
    return cards.length > 0 && cards.some(isUnresolvedFlashcardBlock);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function getStableRiffCards(
    client: SiYuanClient,
    deckID: string,
    page: number,
    pageSize?: number,
): Promise<flashcardApi.FlashcardGetCardsResult | null | undefined> {
    let lastResult = await flashcardApi.getRiffCards(client, deckID, page, pageSize);
    for (let attempt = 1; attempt < GET_CARDS_RETRY_ATTEMPTS; attempt += 1) {
        if (!needsGetCardsRetry(normalizeGetCardsResult(lastResult))) {
            return lastResult;
        }
        await sleep(GET_CARDS_RETRY_DELAY_MS);
        lastResult = await flashcardApi.getRiffCards(client, deckID, page, pageSize);
    }
    return lastResult;
}

const flashcardTool = defineTool<FlashcardAction>({
    name: 'flashcard',
    description: '🃏 Grouped flashcard review and deck operations.',
    variants: FLASHCARD_VARIANTS,
    actionSchema: FlashcardActionSchema,
    aggregateOptions: {
        guidance: FLASHCARD_GUIDANCE,
        actionHints: FLASHCARD_ACTION_HINTS,
    },
    handlers: {
        list_cards: async ({ client, rawArgs }) => {
            const parsed = FlashcardListCardsSchema.parse(rawArgs);
            const result = parsed.scope === 'all'
                ? await flashcardApi.getRiffDueCards(client, '')
                : parsed.scope === 'deck'
                    ? await flashcardApi.getRiffDueCards(client, parsed.deckID)
                    : parsed.scope === 'notebook'
                        ? await flashcardApi.getNotebookRiffDueCards(client, parsed.notebook)
                        : await flashcardApi.getTreeRiffDueCards(client, parsed.rootID);

            const safeResult = result ?? {} as flashcardApi.FlashcardListResult;
            return createJsonResult({
                ...safeResult,
                action: 'list_cards',
                scope: parsed.scope,
                filter: parsed.filter,
                ...(parsed.deckID ? { deckID: parsed.deckID } : {}),
                ...(parsed.notebook ? { notebook: parsed.notebook } : {}),
                ...(parsed.rootID ? { rootID: parsed.rootID } : {}),
                cards: filterCardsByState(Array.isArray(safeResult.cards) ? safeResult.cards : [], parsed.filter),
            });
        },
        get_decks: async ({ client, rawArgs }) => {
            FlashcardGetDecksSchema.parse(rawArgs);
            const result = await flashcardApi.getRiffDecks(client);
            const decks = Array.isArray(result) ? [...result] : [];
            const hasBuiltinDeck = decks.some((deck) => {
                if (!deck || typeof deck !== 'object') return false;
                const typedDeck = deck as Record<string, unknown>;
                return typedDeck.id === BUILTIN_DECK_ID || typedDeck.deckID === BUILTIN_DECK_ID;
            });
            if (!hasBuiltinDeck) {
                decks.unshift({
                    id: BUILTIN_DECK_ID,
                    deckID: BUILTIN_DECK_ID,
                    name: BUILTIN_DECK_NAME,
                    builtin: true,
                });
            }
            return createJsonResult({
                action: 'get_decks',
                decks,
            });
        },
        get_cards: async ({ client, rawArgs }) => {
            const parsed = FlashcardGetCardsSchema.parse(rawArgs);
            const result = await getStableRiffCards(client, parsed.deckID, parsed.page ?? 1, parsed.pageSize);
            return createJsonResult({
                action: 'get_cards',
                deckID: parsed.deckID,
                page: parsed.page ?? 1,
                ...(parsed.pageSize !== undefined ? { pageSize: parsed.pageSize } : {}),
                cards: normalizeGetCardsResult(result),
                total: result?.total,
                pageCount: result?.pageCount,
            });
        },
        review_card: async ({ client, rawArgs }) => {
            const parsed = FlashcardReviewCardSchema.parse(rawArgs);
            if (parsed.deckID === '') {
                throw new Error('flashcard/review_card requires a concrete deckID. Use flashcard/get_cards first to resolve the card deck, then retry.');
            }
            const result = await flashcardApi.reviewRiffCard(client, parsed.deckID, parsed.cardID, parsed.rating, parsed.reviewedCards);
            return createJsonResult({
                action: 'review_card',
                deckID: parsed.deckID,
                cardID: parsed.cardID,
                rating: parsed.rating,
                ...(parsed.reviewedCards !== undefined ? { reviewedCards: parsed.reviewedCards } : {}),
                result,
            });
        },
        skip_review_card: async ({ client, rawArgs }) => {
            const parsed = FlashcardSkipReviewCardSchema.parse(rawArgs);
            if (parsed.deckID === '') {
                throw new Error('flashcard/skip_review_card requires a concrete deckID. Use flashcard/get_cards first to resolve the card deck, then retry.');
            }
            const result = await flashcardApi.skipReviewRiffCard(client, parsed.deckID, parsed.cardID);
            return createJsonResult({
                action: 'skip_review_card',
                deckID: parsed.deckID,
                cardID: parsed.cardID,
                result,
            });
        },
        create_card: async ({ client, rawArgs }) => {
            const parsed = FlashcardCreateCardSchema.parse(rawArgs);
            const deckID = normalizeWritableDeckID(parsed.deckID);
            await ensureFlashcardTargetsWritable(client, parsed.blockIDs);
            await bindBlocksToDeck(client, parsed.blockIDs, deckID);
            const result = await flashcardApi.addRiffCards(client, deckID, parsed.blockIDs);
            await verifyFlashcardBindings(client, parsed.blockIDs, deckID, 'create_card');
            await verifyFlashcardDeckRecords(client, parsed.blockIDs, 'present', 'create_card');
            return createJsonResult({
                action: 'create_card',
                deckID: parsed.deckID,
                effectiveDeckID: deckID,
                blockIDs: parsed.blockIDs,
                result,
            });
        },
        add_card: async ({ client, rawArgs }) => {
            const parsed = FlashcardAddCardSchema.parse(rawArgs);
            const deckID = normalizeWritableDeckID(parsed.deckID);
            await ensureFlashcardTargetsWritable(client, parsed.blockIDs);
            const result = await flashcardApi.addRiffCards(client, deckID, parsed.blockIDs);
            await verifyFlashcardBindings(client, parsed.blockIDs, deckID, 'add_card');
            if (deckID === BUILTIN_DECK_ID) {
                await verifyFlashcardDeckRecords(client, parsed.blockIDs, 'present', 'add_card');
            }
            return createJsonResult({
                action: 'add_card',
                deckID: parsed.deckID,
                effectiveDeckID: deckID,
                blockIDs: parsed.blockIDs,
                result,
            });
        },
        remove_card: async ({ client, rawArgs }) => {
            const parsed = FlashcardRemoveCardSchema.parse(rawArgs);
            const deckID = normalizeWritableDeckID(parsed.deckID);
            const result = await flashcardApi.removeRiffCards(client, deckID, parsed.blockIDs);
            if (deckID === BUILTIN_DECK_ID) {
                await verifyFlashcardDeckRecords(client, parsed.blockIDs, 'absent', 'remove_card');
            }
            return createJsonResult({
                action: 'remove_card',
                deckID: parsed.deckID,
                effectiveDeckID: deckID,
                blockIDs: parsed.blockIDs,
                result,
            });
        },
    },
});

export const listFlashcardTools = flashcardTool.listTools;
export const callFlashcardTool = flashcardTool.callTool;
