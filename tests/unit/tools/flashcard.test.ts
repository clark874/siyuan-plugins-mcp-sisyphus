import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlashcardListCardsSchema } from '@/core/types';
import { callFlashcardTool } from '@/tools/flashcard';

vi.mock('@/api/flashcard', () => ({
    getRiffDecks: vi.fn(),
    getRiffDueCards: vi.fn(),
    getNotebookRiffDueCards: vi.fn(),
    getTreeRiffDueCards: vi.fn(),
    getRiffCards: vi.fn(),
    getRiffCardsByBlockIDs: vi.fn(),
    reviewRiffCard: vi.fn(),
    skipReviewRiffCard: vi.fn(),
    addRiffCards: vi.fn(),
    removeRiffCards: vi.fn(),
}));

vi.mock('@/api/block', () => ({
    getBlockAttrs: vi.fn(),
    setBlockAttrs: vi.fn(),
}));

describe('flashcard tool', () => {
    const enabledActions = {
        enabled: true,
        actions: {
            list_cards: true,
            get_decks: true,
            get_cards: true,
            review_card: true,
            create_card: true,
            remove_card: true,
        },
    } as const;

    beforeEach(async () => {
        const api = await import('@/api/flashcard');
        const attributeApi = await import('@/api/block');
        vi.mocked(api.getRiffDecks).mockReset();
        vi.mocked(api.getRiffDueCards).mockReset();
        vi.mocked(api.getNotebookRiffDueCards).mockReset();
        vi.mocked(api.getTreeRiffDueCards).mockReset();
        vi.mocked(api.getRiffCards).mockReset();
        vi.mocked(api.getRiffCardsByBlockIDs).mockReset();
        vi.mocked(api.reviewRiffCard).mockReset();
        vi.mocked(api.skipReviewRiffCard).mockReset();
        vi.mocked(api.addRiffCards).mockReset();
        vi.mocked(api.removeRiffCards).mockReset();
        vi.mocked(attributeApi.getBlockAttrs).mockReset();
        vi.mocked(attributeApi.setBlockAttrs).mockReset();
    });

    it('routes list_cards(scope="all") to getRiffDueCards without deck id', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.getRiffDueCards).mockResolvedValue({
            cards: [{ cardID: 'c1', state: 0 }, { cardID: 'c2', state: 1 }],
            unreviewedCount: 2,
            unreviewedNewCardCount: 1,
            unreviewedOldCardCount: 1,
        });

        const result = await callFlashcardTool({} as any, {
            action: 'list_cards',
            scope: 'all',
            filter: 'due',
        }, enabledActions as any, {} as any);

        expect(vi.mocked(api.getRiffDueCards)).toHaveBeenCalledWith(expect.anything(), '', undefined);
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            action: 'list_cards',
            scope: 'all',
            filter: 'due',
            unreviewedCount: 2,
        });
    });

    it('treats empty list_cards deckID as omitted for scope="all"', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.getRiffDueCards).mockResolvedValue({ cards: [] });

        const result = await callFlashcardTool({} as any, {
            action: 'list_cards',
            scope: 'all',
            filter: 'due',
            deckID: '',
        }, enabledActions as any, {} as any);

        expect(vi.mocked(api.getRiffDueCards)).toHaveBeenCalledWith(expect.anything(), '', undefined);
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            action: 'list_cards',
            scope: 'all',
            filter: 'due',
            cards: [],
        });
    });

    it('normalizes null due-card payloads to an empty list', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.getRiffDueCards).mockResolvedValue(null as any);

        const result = await callFlashcardTool({} as any, {
            action: 'list_cards',
            scope: 'all',
            filter: 'new',
        }, enabledActions as any, {} as any);

        expect(JSON.parse(result.content[0].text)).toMatchObject({
            action: 'list_cards',
            cards: [],
            filter: 'new',
            scope: 'all',
        });
    });

    it('routes deck/notebook/tree scopes to their matching APIs', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.getRiffDueCards).mockResolvedValue({ cards: [] });
        vi.mocked(api.getNotebookRiffDueCards).mockResolvedValue({ cards: [] });
        vi.mocked(api.getTreeRiffDueCards).mockResolvedValue({ cards: [] });

        await callFlashcardTool({} as any, {
            action: 'list_cards',
            scope: 'deck',
            filter: 'due',
            deckID: 'deck-1',
        }, enabledActions as any, {} as any);
        await callFlashcardTool({} as any, {
            action: 'list_cards',
            scope: 'notebook',
            filter: 'due',
            notebook: 'nb-1',
        }, enabledActions as any, {} as any);
        await callFlashcardTool({} as any, {
            action: 'list_cards',
            scope: 'tree',
            filter: 'due',
            rootID: 'root-1',
        }, enabledActions as any, {} as any);

        expect(vi.mocked(api.getRiffDueCards)).toHaveBeenCalledWith(expect.anything(), 'deck-1', undefined);
        expect(vi.mocked(api.getNotebookRiffDueCards)).toHaveBeenCalledWith(expect.anything(), 'nb-1', undefined);
        expect(vi.mocked(api.getTreeRiffDueCards)).toHaveBeenCalledWith(expect.anything(), 'root-1', undefined);
    });

    it('passes reviewedCards through to due-card list APIs', async () => {
        const api = await import('@/api/flashcard');
        const reviewedCards = [{ cardID: 'card-1', rating: 2 }];
        vi.mocked(api.getRiffDueCards).mockResolvedValue({ cards: [] });

        const result = await callFlashcardTool({} as any, {
            action: 'list_cards',
            scope: 'deck',
            filter: 'due',
            deckID: 'deck-1',
            reviewedCards,
        }, enabledActions as any, {} as any);

        expect(vi.mocked(api.getRiffDueCards)).toHaveBeenCalledWith(expect.anything(), 'deck-1', reviewedCards);
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            action: 'list_cards',
            reviewedCards,
        });
    });

    it('filters only cards array for new/old without recomputing counters', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.getRiffDueCards).mockResolvedValue({
            cards: [
                { cardID: 'c1', state: 0 },
                { cardID: 'c2', state: 1 },
                { cardID: 'c3', state: 'new' },
            ],
            unreviewedCount: 10,
            unreviewedNewCardCount: 7,
            unreviewedOldCardCount: 3,
        });

        const result = await callFlashcardTool({} as any, {
            action: 'list_cards',
            scope: 'all',
            filter: 'new',
        }, enabledActions as any, {} as any);

        const payload = JSON.parse(result.content[0].text);
        expect(payload.cards.map((item: { cardID: string }) => item.cardID)).toEqual(['c1', 'c3']);
        expect(payload.unreviewedCount).toBe(10);
        expect(payload.unreviewedNewCardCount).toBe(7);
        expect(payload.unreviewedOldCardCount).toBe(3);
    });

    it('maps get_cards requests to id and blocks -> cards', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.getRiffCards).mockResolvedValue({
            blocks: [{ id: 'block-1' }, { id: 'block-2' }],
            total: 2,
            pageCount: 1,
        });

        const result = await callFlashcardTool({} as any, {
            action: 'get_cards',
            deckID: '',
            page: 1,
            pageSize: 10,
        }, enabledActions as any, {} as any);

        expect(vi.mocked(api.getRiffCards)).toHaveBeenCalledWith(expect.anything(), '', 1, 10);
        expect(JSON.parse(result.content[0].text)).toEqual({
            action: 'get_cards',
            deckID: '',
            page: 1,
            pageSize: 10,
            cards: [{ id: 'block-1' }, { id: 'block-2' }],
            total: 2,
            pageCount: 1,
        });
    });

    it('retries get_cards when the kernel returns unresolved placeholder blocks', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.getRiffCards)
            .mockResolvedValueOnce({
                blocks: [{ id: 'block-1', type: '', content: '不存在符合条件的内容块' }],
                total: 1,
                pageCount: 1,
            })
            .mockResolvedValueOnce({
                blocks: [{ id: 'block-1', type: 'NodeParagraph', content: 'resolved' }],
                total: 1,
                pageCount: 1,
            });

        const result = await callFlashcardTool({} as any, {
            action: 'get_cards',
            deckID: '',
            page: 1,
            pageSize: 10,
        }, enabledActions as any, {} as any);

        expect(vi.mocked(api.getRiffCards)).toHaveBeenCalledTimes(2);
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            cards: [{ id: 'block-1', type: 'NodeParagraph', content: 'resolved' }],
        });
    });

    it('rejects document blocks in create_card', async () => {
        const attributeApi = await import('@/api/block');
        vi.mocked(attributeApi.getBlockAttrs).mockResolvedValue({
            type: 'doc',
        });

        const result = await callFlashcardTool({} as any, {
            action: 'create_card',
            deckID: '',
            blockIDs: ['doc-1'],
        }, enabledActions as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('document block');
    });

    it('rejects unknown decks before calling addRiffCards', async () => {
        const api = await import('@/api/flashcard');
        const attributeApi = await import('@/api/block');
        vi.mocked(attributeApi.getBlockAttrs).mockResolvedValue({ type: 'p' });
        vi.mocked(api.getRiffDecks).mockResolvedValue([{ id: 'deck-a', name: 'Deck A' }]);

        const result = await callFlashcardTool({} as any, {
            action: 'create_card',
            deckID: 'missing-deck',
            blockIDs: ['block-1'],
        }, enabledActions as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('requires an existing deckID');
        expect(vi.mocked(api.addRiffCards)).not.toHaveBeenCalled();
        expect(vi.mocked(attributeApi.setBlockAttrs)).not.toHaveBeenCalled();
    });

    it('create_card delegates binding and card creation to addRiffCards', async () => {
        const api = await import('@/api/flashcard');
        const attributeApi = await import('@/api/block');
        vi.mocked(attributeApi.getBlockAttrs)
            .mockResolvedValueOnce({ type: 'p', 'custom-riff-decks': 'deck-a' })
            .mockResolvedValueOnce({ type: 'p', 'custom-riff-decks': 'deck-a,deck-b' });
        vi.mocked(api.getRiffDecks).mockResolvedValue([{ id: 'deck-b', name: 'Deck B' }]);
        vi.mocked(api.addRiffCards).mockResolvedValue({ id: 'deck-b' });

        const result = await callFlashcardTool({} as any, {
            action: 'create_card',
            deckID: 'deck-b',
            blockIDs: ['block-1'],
        }, enabledActions as any, {} as any);

        expect(vi.mocked(attributeApi.setBlockAttrs)).not.toHaveBeenCalled();
        expect(vi.mocked(api.addRiffCards)).toHaveBeenCalledWith(expect.anything(), 'deck-b', ['block-1']);
        expect(vi.mocked(api.getRiffCardsByBlockIDs)).not.toHaveBeenCalled();
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            action: 'create_card',
            deckID: 'deck-b',
            effectiveDeckID: 'deck-b',
            blockIDs: ['block-1'],
        });
    });

    it('accepts blockID alias for create_card', async () => {
        const api = await import('@/api/flashcard');
        const attributeApi = await import('@/api/block');
        vi.mocked(attributeApi.getBlockAttrs)
            .mockResolvedValueOnce({ type: 'p', 'custom-riff-decks': 'deck-b' })
            .mockResolvedValueOnce({ type: 'p', 'custom-riff-decks': 'deck-b' });
        vi.mocked(api.getRiffDecks).mockResolvedValue([{ id: 'deck-b', name: 'Deck B' }]);
        vi.mocked(api.addRiffCards).mockResolvedValue({ id: 'deck-b' });

        const result = await callFlashcardTool({} as any, {
            action: 'create_card',
            deckID: 'deck-b',
            blockID: 'block-1',
        }, enabledActions as any, {} as any);

        expect(result.isError).toBeUndefined();
        expect(vi.mocked(api.addRiffCards)).toHaveBeenCalledWith(expect.anything(), 'deck-b', ['block-1']);
        expect(JSON.parse(result.content[0].text).blockIDs).toEqual(['block-1']);
    });

    it('normalizes empty create_card deck IDs to the built-in deck', async () => {
        const api = await import('@/api/flashcard');
        const attributeApi = await import('@/api/block');
        vi.mocked(attributeApi.getBlockAttrs)
            .mockResolvedValueOnce({ type: 'p' })
            .mockResolvedValueOnce({ type: 'p', 'custom-riff-decks': '20230218211946-2kw8jgx' });
        vi.mocked(api.addRiffCards).mockResolvedValue({ id: '20230218211946-2kw8jgx' });
        vi.mocked(api.getRiffCardsByBlockIDs).mockResolvedValue({
            blocks: [{ id: 'block-1', riffCardID: 'card-1', riffCard: { state: 0 } }],
        });

        const result = await callFlashcardTool({} as any, {
            action: 'create_card',
            deckID: '',
            blockIDs: ['block-1'],
        }, enabledActions as any, {} as any);

        expect(vi.mocked(attributeApi.setBlockAttrs)).not.toHaveBeenCalled();
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            action: 'create_card',
            deckID: '',
            effectiveDeckID: '20230218211946-2kw8jgx',
        });
    });

    it('fails create_card when the deck binding is not persisted', async () => {
        const api = await import('@/api/flashcard');
        const attributeApi = await import('@/api/block');
        vi.mocked(attributeApi.getBlockAttrs)
            .mockResolvedValueOnce({ type: 'p' })
            .mockResolvedValueOnce({ type: 'p', 'custom-riff-decks': '' });
        vi.mocked(api.getRiffDecks).mockResolvedValue([{ id: 'deck-1', name: 'Deck 1' }]);
        vi.mocked(api.addRiffCards).mockResolvedValue({ id: 'deck-1' });

        const result = await callFlashcardTool({} as any, {
            action: 'create_card',
            deckID: 'deck-1',
            blockIDs: ['block-1'],
        }, enabledActions as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('flashcard/create_card did not persist a valid deck binding');
    });

    it('includes the built-in deck in get_decks when the kernel hides it', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.getRiffDecks).mockResolvedValue([]);

        const result = await callFlashcardTool({} as any, {
            action: 'get_decks',
        }, enabledActions as any, {} as any);

        expect(JSON.parse(result.content[0].text)).toEqual({
            action: 'get_decks',
            decks: [{
                id: '20230218211946-2kw8jgx',
                deckID: '20230218211946-2kw8jgx',
                name: 'Built-in Deck',
                builtin: true,
            }],
        });
    });

    it('normalizes empty create_card deck IDs to the built-in deck and verifies attrs', async () => {
        const api = await import('@/api/flashcard');
        const attributeApi = await import('@/api/block');
        vi.mocked(attributeApi.getBlockAttrs)
            .mockResolvedValueOnce({ type: 'p' })
            .mockResolvedValueOnce({ type: 'p', 'custom-riff-decks': '20230218211946-2kw8jgx' });
        vi.mocked(api.addRiffCards).mockResolvedValue({ id: '20230218211946-2kw8jgx' });
        vi.mocked(api.getRiffCardsByBlockIDs).mockResolvedValue({
            blocks: [{ id: 'block-1', riffCardID: 'card-1', riffCard: { state: 0 } }],
        });

        const result = await callFlashcardTool({} as any, {
            action: 'create_card',
            deckID: '',
            blockIDs: ['block-1'],
        }, enabledActions as any, {} as any);

        expect(vi.mocked(api.addRiffCards)).toHaveBeenCalledWith(expect.anything(), '20230218211946-2kw8jgx', ['block-1']);
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            action: 'create_card',
            deckID: '',
            effectiveDeckID: '20230218211946-2kw8jgx',
            blockIDs: ['block-1'],
        });
    });

    it('fails create_card when the deck binding is not persisted', async () => {
        const api = await import('@/api/flashcard');
        const attributeApi = await import('@/api/block');
        vi.mocked(attributeApi.getBlockAttrs)
            .mockResolvedValueOnce({ type: 'p' })
            .mockResolvedValueOnce({ type: 'p', 'custom-riff-decks': '' });
        vi.mocked(api.addRiffCards).mockResolvedValue({ id: '20230218211946-2kw8jgx' });

        const result = await callFlashcardTool({} as any, {
            action: 'create_card',
            deckID: '',
            blockIDs: ['block-1'],
        }, enabledActions as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('did not persist a valid deck binding');
    });

    it('normalizes empty remove_card deck IDs to the built-in deck', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.removeRiffCards).mockResolvedValue({ id: '20230218211946-2kw8jgx' });
        vi.mocked(api.getRiffCardsByBlockIDs).mockResolvedValue({
            blocks: [{ id: 'block-1', content: '不存在符合条件的内容块' }],
        });

        const result = await callFlashcardTool({} as any, {
            action: 'remove_card',
            deckID: '',
            blockIDs: ['block-1'],
        }, enabledActions as any, {} as any);

        expect(vi.mocked(api.removeRiffCards)).toHaveBeenCalledWith(expect.anything(), '20230218211946-2kw8jgx', ['block-1']);
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            action: 'remove_card',
            deckID: '',
            effectiveDeckID: '20230218211946-2kw8jgx',
        });
    });

    it('fails create_card when the builtin deck record is not queryable after write', async () => {
        const api = await import('@/api/flashcard');
        const attributeApi = await import('@/api/block');
        vi.mocked(attributeApi.getBlockAttrs)
            .mockResolvedValueOnce({ type: 'p' })
            .mockResolvedValueOnce({ type: 'p', 'custom-riff-decks': '20230218211946-2kw8jgx' });
        vi.mocked(api.addRiffCards).mockResolvedValue({ id: '20230218211946-2kw8jgx' });
        vi.mocked(api.getRiffCardsByBlockIDs).mockResolvedValue({
            blocks: [{ id: 'block-1', content: '不存在符合条件的内容块' }],
        });

        const result = await callFlashcardTool({} as any, {
            action: 'create_card',
            deckID: '',
            blockIDs: ['block-1'],
        }, enabledActions as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('did not create readable riff card records');
    });

    it('fails remove_card when builtin deck records remain queryable', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.removeRiffCards).mockResolvedValue({ id: '20230218211946-2kw8jgx' });
        vi.mocked(api.getRiffCardsByBlockIDs).mockResolvedValue({
            blocks: [{ id: 'block-1', riffCardID: 'card-1', riffCard: { state: 0 } }],
        });

        const result = await callFlashcardTool({} as any, {
            action: 'remove_card',
            deckID: '',
            blockIDs: ['block-1'],
        }, enabledActions as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('did not fully remove readable riff card records');
    });

    it('rejects empty deck IDs for review and skip actions', async () => {
        const reviewResult = await callFlashcardTool({} as any, {
            action: 'review_card',
            deckID: '',
            cardID: 'card-1',
            rating: 3,
        }, enabledActions as any, {} as any);
        const skipResult = await callFlashcardTool({} as any, {
            action: 'review_card',
            deckID: '',
            cardID: 'card-1',
            skip: true,
        }, enabledActions as any, {} as any);

        expect(reviewResult.isError).toBe(true);
        expect(reviewResult.content[0].text).toContain('requires a concrete deckID');
        expect(skipResult.isError).toBe(true);
        expect(skipResult.content[0].text).toContain('requires a concrete deckID');
    });

    it('passes reviewedCards with cardID through to the kernel review API', async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.reviewRiffCard).mockResolvedValue(null);

        const result = await callFlashcardTool({} as any, {
            action: 'review_card',
            deckID: 'deck-1',
            cardID: 'card-2',
            rating: 3,
            reviewedCards: [{ cardID: 'card-1', rating: 2 }],
        }, enabledActions as any, {} as any);

        expect(result.isError).toBeUndefined();
        expect(vi.mocked(api.reviewRiffCard)).toHaveBeenCalledWith(
            expect.anything(),
            'deck-1',
            'card-2',
            3,
            [{ cardID: 'card-1', rating: 2 }],
        );
    });

    it('rejects reviewedCards entries without cardID before calling the kernel', async () => {
        const api = await import('@/api/flashcard');

        const result = await callFlashcardTool({} as any, {
            action: 'review_card',
            deckID: 'deck-1',
            cardID: 'card-2',
            rating: 3,
            reviewedCards: [{ id: 'card-1' }],
        }, enabledActions as any, {} as any);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('reviewedCards[0].cardID is required');
        expect(vi.mocked(api.reviewRiffCard)).not.toHaveBeenCalled();
    });

    it('returns structured help including remove_card danger hint', async () => {
        const result = await callFlashcardTool({} as any, { action: 'help' }, enabledActions as any, {} as any);
        const payload = JSON.parse(result.content[0].text);

        expect(payload.guidance).toContain('flashcard actions cover review-first flashcard workflows and deck discovery.');
        expect(payload.actions.create_card.hint).toContain('turn existing blocks into flashcards');
        expect(payload.actions.remove_card.hint).toContain('requires explicit user confirmation');
    });

    it('validates scope-specific required fields', () => {
        const parsed = FlashcardListCardsSchema.safeParse({
            action: 'list_cards',
            scope: 'deck',
            filter: 'due',
        });

        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues[0]?.message).toContain('deckID is required');
        }
    });
});
