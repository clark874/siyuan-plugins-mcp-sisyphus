<script lang="ts">
    import type { FeedPropKind } from './puppy-bubble';

    export let clickHintText = '';
    export let showBubble = false;
    export let bubbleText = '';
    export let bubbleToneClass = '';
    export let bubblePositionClass = '';
    export let bubbleOffsetClass = '';
    export let bubbleTailClass = '';
    export let showWageCard = false;
    export let balance = 0;
    export let heartBurstSeq = 0;
    export let heartBurstVisible = false;
    export let feedPropSeq = 0;
    export let feedPropVisible = false;
    export let feedPropKind: FeedPropKind = 'none';
    export let feedPropEmoji = '';
</script>

{#if clickHintText || (showBubble && bubbleText)}
<div class="sy-puppy__bubble {bubbleToneClass} {bubblePositionClass} {bubbleOffsetClass} {bubbleTailClass}">
    <span>{clickHintText || bubbleText}</span>
</div>
{/if}

{#if showWageCard}
<div class="sy-puppy__bubble sy-puppy__bubble--wage-card sy-puppy__bubble--wage-card-tail" aria-label={`当前余额 ${balance}`}>
    <span>余额 {balance}</span>
</div>
{/if}

{#key heartBurstSeq}
    {#if heartBurstVisible}
    <div class="sy-puppy__hearts" aria-hidden="true">
        <span class="sy-puppy__heart sy-puppy__heart--main">❤</span>
        <span class="sy-puppy__heart sy-puppy__heart--side">❤</span>
    </div>
    {/if}
{/key}

{#key feedPropSeq}
    {#if feedPropVisible}
    <div class="sy-puppy__feed-prop sy-puppy__feed-prop--{feedPropKind}" aria-hidden="true">
        <span>{feedPropEmoji}</span>
    </div>
    {/if}
{/key}

<style>
    :global(.sy-puppy__hearts) {
        position: absolute;
        left: 12px;
        bottom: calc(100% + 6px);
        width: 44px;
        height: 42px;
        pointer-events: none;
    }

    :global(.sy-puppy__heart) {
        position: absolute;
        display: block;
        color: #ff5f9c;
        font-size: 18px;
        line-height: 1;
        text-shadow:
            -1px 0 #8f1f53,
            1px 0 #8f1f53,
            0 -1px #8f1f53,
            0 1px #8f1f53;
        image-rendering: pixelated;
        animation: sy-puppy-heart-rise 0.98s steps(4) forwards;
    }

    :global(.sy-puppy__heart--main) {
        left: 12px;
        bottom: 0;
    }

    :global(.sy-puppy__heart--side) {
        left: 0;
        bottom: 6px;
        font-size: 14px;
        animation-duration: 0.88s;
        animation-delay: 0.06s;
    }

    :global(.sy-puppy__feed-prop) {
        position: absolute;
        left: 44px;
        top: 16px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        image-rendering: pixelated;
        animation:
            sy-puppy-feed-pop 0.22s steps(3),
            sy-puppy-feed-idle 1.4s ease-in-out infinite 0.22s;
        z-index: 3;
    }

    :global(.sy-puppy__feed-prop span) {
        display: block;
        font-size: 20px;
        line-height: 1;
        filter: drop-shadow(0 2px 0 rgba(26, 31, 60, 0.18));
    }

    :global(.sy-puppy__feed-prop--food) {
        transform-origin: 12px 20px;
    }

    :global(.sy-puppy__feed-prop--drink) {
        left: 46px;
        top: 14px;
        transform-origin: 14px 20px;
    }

    :global(.sy-puppy__bubble) {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 14px);
        transform: translateX(-50%);
        min-width: 110px;
        max-width: 210px;
        padding: 8px 10px;
        border: 2px solid #1a1f3c;
        border-radius: 10px;
        background: #fffdf2;
        box-shadow: 0 4px 0 rgba(26, 31, 60, 0.18);
        font-size: 12px;
        line-height: 1.35;
        color: #1a1f3c;
        animation: sy-puppy-bubble-in 0.18s steps(2);
    }

    :global(.sy-puppy__bubble--left) {
        left: -10px;
        transform: none;
        animation-name: sy-puppy-bubble-in-left;
    }

    :global(.sy-puppy__bubble--right) {
        left: auto;
        right: -16px;
        transform: none;
        animation-name: sy-puppy-bubble-in-left;
    }

    :global(.sy-puppy__bubble--high) {
        bottom: calc(100% + 24px);
    }

    :global(.sy-puppy__bubble--error-offset) {
        bottom: calc(100% + 28px);
    }

    :global(.sy-puppy__bubble--high.sy-puppy__bubble--error-offset) {
        bottom: calc(100% + 38px);
    }

    :global(.sy-puppy__bubble--wage-card) {
        left: 54px;
        bottom: 6px;
        min-width: 66px;
        max-width: 90px;
        padding: 5px 7px;
        background: #edf3ff;
        border-color: #1a1f3c;
        font-size: 11px;
        box-shadow: 0 3px 0 rgba(26, 31, 60, 0.16);
        transform: none;
        animation: sy-puppy-bubble-in-left 0.18s steps(2);
    }

    :global(.sy-puppy__bubble--wage-card span) {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    :global(.sy-puppy__bubble--wage-card span::before) {
        content: '💰';
        font-size: 12px;
    }

    :global(.sy-puppy__bubble.sy-puppy__bubble--wage-card-tail::after) {
        left: 10px;
        right: auto;
        border-top-color: #edf3ff;
    }

    :global(.sy-puppy__bubble.sy-puppy__bubble--wage-card-tail::before) {
        left: 8px;
        right: auto;
    }

    :global(.sy-puppy__bubble::after) {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -9px;
        transform: translateX(-50%);
        border: 8px solid transparent;
        border-top-color: #fffdf2;
        border-bottom: 0;
    }

    :global(.sy-puppy__bubble::before) {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -12px;
        transform: translateX(-50%);
        border: 10px solid transparent;
        border-top-color: #1a1f3c;
        border-bottom: 0;
    }

    :global(.sy-puppy__bubble--tail-left::before),
    :global(.sy-puppy__bubble--tail-left::after) {
        left: 24px;
    }

    :global(.sy-puppy__bubble--tail-center::before),
    :global(.sy-puppy__bubble--tail-center::after) {
        left: 50%;
    }

    :global(.sy-puppy__bubble--tail-right::before),
    :global(.sy-puppy__bubble--tail-right::after) {
        left: auto;
        right: 24px;
        transform: none;
    }

    :global(.sy-puppy__bubble--error) {
        background: #fff0f2;
        border-color: #ff4d6d;
    }

    @keyframes sy-puppy-bubble-in {
        from { opacity: 0; transform: translateX(-50%) translateY(4px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    @keyframes sy-puppy-bubble-in-left {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
    }

    @keyframes sy-puppy-heart-rise {
        0% { opacity: 0; transform: translateY(10px) scale(0.7); }
        25% { opacity: 1; transform: translateY(2px) scale(1); }
        100% { opacity: 0; transform: translateY(-18px) scale(1.15); }
    }

    @keyframes sy-puppy-feed-pop {
        0% { opacity: 0; transform: translate(10px, 8px) scale(0.6) rotate(10deg); }
        65% { opacity: 1; transform: translate(-2px, -1px) scale(1.08) rotate(-6deg); }
        100% { opacity: 1; transform: translate(0, 0) scale(1) rotate(0deg); }
    }

    @keyframes sy-puppy-feed-idle {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-3px) rotate(4deg); }
    }
</style>
