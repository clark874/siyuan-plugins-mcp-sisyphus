import { describe, expect, it } from 'vitest';

import {
    RANDOM_TEST_ACTIONS,
    resolveActionState,
    resolveToolVariant,
} from '@/components/puppy-tool-visuals';

describe('puppy tool visuals helpers', () => {
    it('maps av actions into reading and writing states', () => {
        expect(resolveActionState('get')).toBe('reading');
        expect(resolveActionState('search')).toBe('reading');
        expect(resolveActionState('get_primary_key_values')).toBe('reading');
        expect(resolveActionState('set_cell')).toBe('writing');
        expect(resolveActionState('batch_set_cells')).toBe('writing');
        expect(resolveActionState('duplicate_block')).toBe('writing');
    });

    it('maps mascot actions into reading and writing states', () => {
        expect(resolveActionState('get_balance')).toBe('reading');
        expect(resolveActionState('shop')).toBe('reading');
        expect(resolveActionState('buy')).toBe('writing');
    });

    it('maps flashcard actions into reading, writing, and deleting states', () => {
        expect(resolveActionState('list_cards')).toBe('reading');
        expect(resolveActionState('get_decks')).toBe('reading');
        expect(resolveActionState('review_card')).toBe('writing');
        expect(resolveActionState('remove_card')).toBe('deleting');
    });

    it('recognizes av, flashcard, and mascot as supported tool variants', () => {
        expect(resolveToolVariant('av')).toBe('av');
        expect(resolveToolVariant('flashcard')).toBe('flashcard');
        expect(resolveToolVariant('mascot')).toBe('mascot');
        expect(resolveToolVariant('unknown')).toBe('none');
    });

    it('includes av, flashcard, and mascot actions in random test rotation', () => {
        expect(RANDOM_TEST_ACTIONS).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ tool: 'av', action: 'get' }),
                expect.objectContaining({ tool: 'av', action: 'set_cell' }),
                expect.objectContaining({ tool: 'flashcard', action: 'list_cards' }),
                expect.objectContaining({ tool: 'flashcard', action: 'review_card' }),
                expect.objectContaining({ tool: 'mascot', action: 'get_balance' }),
                expect.objectContaining({ tool: 'mascot', action: 'buy' }),
            ]),
        );
    });
});
