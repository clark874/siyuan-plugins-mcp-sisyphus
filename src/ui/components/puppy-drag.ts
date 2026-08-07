import { hasPointerMovedEnough } from './puppy-interactions';

export type PointerState = 'pointer-press' | 'pointer-drag';

export type DragSession = {
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    pointerMoved: boolean;
};

export function startDrag(clientX: number, clientY: number, posX: number, posY: number): DragSession {
    return {
        startX: clientX,
        startY: clientY,
        baseX: posX,
        baseY: posY,
        pointerMoved: false,
    };
}

export function moveDrag(session: DragSession, clientX: number, clientY: number): {
    session: DragSession;
    posX: number;
    posY: number;
    pointerState: PointerState;
} {
    const deltaX = clientX - session.startX;
    const deltaY = clientY - session.startY;
    const movedEnough = hasPointerMovedEnough(deltaX, deltaY);
    const pointerMoved = session.pointerMoved || movedEnough;
    return {
        session: { ...session, pointerMoved },
        posX: pointerMoved ? session.baseX + deltaX : session.baseX,
        posY: pointerMoved ? session.baseY + deltaY : session.baseY,
        pointerState: pointerMoved ? 'pointer-drag' : 'pointer-press',
    };
}
