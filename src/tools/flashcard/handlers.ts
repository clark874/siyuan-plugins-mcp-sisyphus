import type { SiYuanClient } from '../../api/client';
import * as attributeApi from '../../api/block';
import * as flashcardApi from '../../api/flashcard';
import type { FlashcardAction } from '../../core/config';
import {
    FlashcardAddCardSchema,
    FlashcardCreateCardSchema,
    FlashcardGetCardsSchema,
    FlashcardGetDecksSchema,
    FlashcardListCardsSchema,
    FlashcardRemoveCardSchema,
    FlashcardReviewCardSchema,
    FlashcardSkipReviewCardSchema,
} from '../../core/types';
import type { ToolActionHandler } from '../define-tool';
import { createJsonResult } from '../shared';
import { sleep } from '../../shared/async';

const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';
const NODE_ATTR_RIFF_DECKS = 'custom-riff-decks';
const BUILTIN_DECK_NAME = 'Built-in Deck';
const GET_CARDS_RETRY_ATTEMPTS = 5;
const GET_CARDS_RETRY_DELAY_MS = 300;
const FLASHCARD_BINDING_VERIFY_ATTEMPTS = 6;
const FLASHCARD_BINDING_VERIFY_DELAY_MS = 300;

type BlockAttrMap = Record<string, string>;

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

const handleListCards: FlashcardActionHandler = async ({ client, rawArgs }) => {
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
};

const handleGetDecks: FlashcardActionHandler = async ({ client, rawArgs }) => {
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
};

const handleGetCards: FlashcardActionHandler = async ({ client, rawArgs }) => {
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
};

const handleReviewCard: FlashcardActionHandler = async ({ client, rawArgs }) => {
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
};

const handleSkipReviewCard: FlashcardActionHandler = async ({ client, rawArgs }) => {
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
};

const handleCreateCard: FlashcardActionHandler = async ({ client, rawArgs }) => {
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
};

const handleAddCard: FlashcardActionHandler = async ({ client, rawArgs }) => {
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
};

const handleRemoveCard: FlashcardActionHandler = async ({ client, rawArgs }) => {
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
};

export const FLASHCARD_ACTION_HANDLERS: Record<FlashcardAction, FlashcardActionHandler> = {
    list_cards: handleListCards,
    get_decks: handleGetDecks,
    get_cards: handleGetCards,
    review_card: handleReviewCard,
    skip_review_card: handleSkipReviewCard,
    create_card: handleCreateCard,
    add_card: handleAddCard,
    remove_card: handleRemoveCard,
};
