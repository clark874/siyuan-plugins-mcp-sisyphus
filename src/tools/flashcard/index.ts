import type { FlashcardAction } from '../../core/config';
import { FLASHCARD_ACTION_HINTS, FLASHCARD_GUIDANCE } from '../../core/help';
import { FlashcardActionSchema } from '../../core/types';
import { defineTool } from '../define-tool';
import { createActionSchema, type ActionVariant } from '../shared';
import { FLASHCARD_ACTION_HANDLERS } from './handlers';

export const FLASHCARD_TOOL_NAME = 'flashcard';

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
            reviewedCards: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { cardID: { type: 'string', description: 'Reviewed card ID' } },
                    required: ['cardID'],
                    additionalProperties: true,
                },
                description: 'Optional already-reviewed cards; SiYuan reads reviewedCards[].cardID',
            },
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

const flashcardTool = defineTool<FlashcardAction>({
    name: 'flashcard',
    description: '🃏 Grouped flashcard review and deck operations.',
    variants: FLASHCARD_VARIANTS,
    actionSchema: FlashcardActionSchema,
    aggregateOptions: {
        guidance: FLASHCARD_GUIDANCE,
        actionHints: FLASHCARD_ACTION_HINTS,
    },
    handlers: FLASHCARD_ACTION_HANDLERS,
});

export const listFlashcardTools = flashcardTool.listTools;
export const callFlashcardTool = flashcardTool.callTool;
