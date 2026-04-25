export type FeedPropKind = 'none' | 'food' | 'drink';

export function shouldShowBalanceCard(tool: string, action: string): boolean {
    return tool === 'mascot' && action === 'get_balance';
}

export function getFeedProp(
    action: string,
    bubble: string,
    mascotItemEmoji: string,
    mascotItemType: string,
): { emoji: string; kind: FeedPropKind } | null {
    if (action !== 'buy') return null;
    if (mascotItemEmoji && mascotItemType) {
        return {
            emoji: mascotItemEmoji,
            kind: mascotItemType === 'drink' ? 'drink' : 'food',
        };
    }
    if (bubble.includes('猫粮')) return { emoji: '🍖', kind: 'food' };
    if (bubble.includes('牛奶')) return { emoji: '🥛', kind: 'drink' };
    return null;
}

export function formatBubbleText(
    tool: string,
    action: string,
    status: 'running' | 'success' | 'error',
    meta: { balance: number; mascotItemLabel: string },
    testing = false,
): string {
    const suffix = testing ? ' · test' : '';
    if (tool === 'mascot') {
        if (status === 'running') {
            if (action === 'get_balance') return `查看余额${suffix}`;
            if (action === 'shop') return `查看商店${suffix}`;
            if (action === 'buy') return meta.mascotItemLabel ? `购买${meta.mascotItemLabel}${suffix}` : `购买商品${suffix}`;
        }
        if (status === 'success') {
            if (action === 'get_balance') return `余额 ${meta.balance}${suffix}`;
            if (action === 'shop') return `商店已打开 ✓${suffix}`;
            if (action === 'buy') return meta.mascotItemLabel ? `买到${meta.mascotItemLabel} ✓${suffix}` : `购买成功 ✓${suffix}`;
        }
        if (action === 'get_balance') return `查看余额 ✗${suffix}`;
        if (action === 'shop') return `查看商店 ✗${suffix}`;
        if (action === 'buy') return meta.mascotItemLabel ? `${meta.mascotItemLabel}不足 ✗${suffix}` : `购买失败 ✗${suffix}`;
    }

    if (status === 'running') return `${tool}/${action}${suffix}`;
    return `${tool}/${action} ${status === 'success' ? '✓' : '✗'}${suffix}`;
}
