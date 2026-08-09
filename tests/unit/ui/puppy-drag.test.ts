import { describe, expect, it } from 'vitest';

import { moveDrag, startDrag } from '@/ui/components/puppy-drag';

describe('puppy drag', () => {
    it('keeps a neutral press anchored when movement is below threshold', () => {
        const session = startDrag(10, 10, 100, 200);
        const moved = moveDrag(session, 12, 12);
        expect(moved.pointerState).toBe('pointer-press');
        expect(moved.session.pointerMoved).toBe(false);
        expect(moved.posX).toBe(100);
        expect(moved.posY).toBe(200);
    });

    it('switches to pointer-drag after enough movement', () => {
        const session = startDrag(0, 0, 50, 60);
        const moved = moveDrag(session, 20, 0);
        expect(moved.pointerState).toBe('pointer-drag');
        expect(moved.session.pointerMoved).toBe(true);
        expect(moved.posX).toBe(70);
        expect(moved.posY).toBe(60);
    });
});
