import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlashcardListCardsSchema } from '@/mcp/types';
import { callFlashcardTool } from '@/mcp/tools/flashcard';

vi.mock('@/api/flashcard', () => ({
    getRiffDecks: vi.fn(),
    getRiffDueCards: vi.fn(),
    getNotebookRiffDueCards: vi.fn(),
    getTreeRiffDueCards: vi.fn(),
    reviewRiffCard: vi.fn(),
    skipReviewRiffCard: vi.fn(),
    addRiffCards: vi.fn(),
    removeRiffCards: vi.fn(),
}));

describe('flashcard tool', () => {
    const enabledActions = {
        enabled: true,
        actions: {
            list_cards: true,
            get_decks: true,
            review_card: true,
            skip_review_card: true,
            add_card: true,
            remove_card: true,
        },
    } as const;

    beforeEach(async () => {
        const api = await import('@/api/flashcard');
        vi.mocked(api.getRiffDecks).mockReset();
        vi.mocked(api.getRiffDueCards).mockReset();
        vi.mocked(api.getNotebookRiffDueCards).mockReset();
        vi.mocked(api.getTreeRiffDueCards).mockReset();
        vi.mocked(api.reviewRiffCard).mockReset();
        vi.mocked(api.skipReviewRiffCard).mockReset();
        vi.mocked(api.addRiffCards).mockReset();
        vi.mocked(api.removeRiffCards).mockReset();
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

        expect(vi.mocked(api.getRiffDueCards)).toHaveBeenCalledWith(expect.anything());
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            action: 'list_cards',
            scope: 'all',
            filter: 'due',
            unreviewedCount: 2,
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

        expect(vi.mocked(api.getRiffDueCards)).toHaveBeenCalledWith(expect.anything(), 'deck-1');
        expect(vi.mocked(api.getNotebookRiffDueCards)).toHaveBeenCalledWith(expect.anything(), 'nb-1');
        expect(vi.mocked(api.getTreeRiffDueCards)).toHaveBeenCalledWith(expect.anything(), 'root-1');
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

    it('returns structured help including remove_card danger hint', async () => {
        const result = await callFlashcardTool({} as any, { action: 'help' }, enabledActions as any, {} as any);
        const payload = JSON.parse(result.content[0].text);

        expect(payload.guidance).toContain('flashcard actions cover review-first flashcard workflows and deck discovery.');
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
