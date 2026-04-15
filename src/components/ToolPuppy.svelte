<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import {
        getIdleMotionDelayMs,
        pickNextIdleMotion,
        type IdleMotion,
    } from './puppy-motion';
    import {
        parsePuppyEventPayload,
        shouldShowWageCard,
        type PuppyEventPayload,
    } from './puppy-interactions';
    import {
        formatBubbleText,
        getFeedProp,
        shouldShowBalanceCard,
        type FeedPropKind,
    } from './puppy-bubble';
    import { loadPuppyPosition, savePuppyPosition } from './puppy-position';
    import { createJsonFilePoller, type Poller } from './puppy-polling';
    import { moveDrag, startDrag, type DragSession } from './puppy-drag';
    import { createTestModeRunner, type TestModeRunner } from './puppy-test-mode';
    import {
        resolveActionState,
        resolveToolVariant,
        RANDOM_TEST_ACTIONS,
        type PuppyState,
        type TestActionEntry,
        type ToolVariant,
    } from './puppy-tool-visuals';

    export let visible = true;
    export let testModeEnabled = false;
    export let testModeIntervalMs = 2200;
    export let showBubble = false;
    export let showClickHint = true;

    const EVENTS_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/puppyEvents.json';
    const API_FILE_ENDPOINT = '/api/file/getFile';
    const POLL_INTERVAL = 500;
    const IDLE_TIMEOUT = 3000;
    const RESULT_DISPLAY_TIME = 2400;
    const POINTER_RELEASE_TIME = 260;
    const HEART_DISPLAY_TIME = 980;
    const FEED_PROP_DISPLAY_TIME = 10000;
    const CLICK_HINT_DISPLAY_TIME = 2600;

    type ResultState = 'none' | 'success' | 'error';
    type PointerState = 'none' | 'pointer-down' | 'pointer-drag' | 'pointer-release';

    const TEST_SUCCESS_WEIGHT = 0.8;

    let state: PuppyState = 'idle';
    let resultState: ResultState = 'none';
    let toolVariant: ToolVariant = 'none';
    let toolAction = '';
    let bubbleText = '';
    let lastSeq = 0;
    let poller: Poller;
    let idleTimer: ReturnType<typeof setTimeout>;
    let resultTimer: ReturnType<typeof setTimeout>;
    let blinkTimer: ReturnType<typeof setInterval>;
    let idleMotionTimer: ReturnType<typeof setTimeout> | undefined;
    let pointerReleaseTimer: ReturnType<typeof setTimeout> | undefined;
    let heartTimer: ReturnType<typeof setTimeout> | undefined;
    let feedPropTimer: ReturnType<typeof setTimeout> | undefined;
    let clickHintTimer: ReturnType<typeof setTimeout> | undefined;
    let testRunner: TestModeRunner;
    let mounted = false;

    let posX: number;
    let posY: number;
    let dragSession: DragSession | null = null;

    let blinking = false;
    let idleMotion: IdleMotion = 'stand';
    let pointerState: PointerState = 'none';
    let balance = 0;
    let heartBurstVisible = false;
    let heartBurstSeq = 0;
    let showWageCard = false;
    let feedPropVisible = false;
    let feedPropEmoji = '';
    let feedPropKind: FeedPropKind = 'none';
    let feedPropSeq = 0;
    let mascotItemLabel = '';
    let mascotItemType = '';
    let mascotItemEmoji = '';
    let clickHintText = '';

    const MASCOT_CLICK_HINT = '我是 MCP 插件提供的猫猫，可在设置里关闭这个提示。';

    function bubbleMeta() {
        return { balance, mascotItemLabel };
    }

    function pickRandomAction(): TestActionEntry {
        return RANDOM_TEST_ACTIONS[Math.floor(Math.random() * RANDOM_TEST_ACTIONS.length)];
    }

    function applyDisplayEvent(tool: string, action: string, status: 'running' | 'success' | 'error') {
        const nextTool = resolveToolVariant(tool);
        if (status === 'running') {
            state = resolveActionState(action);
            resultState = 'none';
            toolVariant = nextTool;
            toolAction = action;
            showWageCard = shouldShowBalanceCard(tool, action) || shouldShowWageCard();
            bubbleText = formatBubbleText(tool, action, status, bubbleMeta(), true);
            clearTimeout(resultTimer);
            resetIdleTimer();
            return;
        }

        state = resolveActionState(action);
        resultState = status;
        toolVariant = nextTool;
        toolAction = action;
        const nextBubbleText = formatBubbleText(tool, action, status, bubbleMeta(), true);
        if (tool === 'mascot' && status === 'success' && action !== 'get_balance') {
            triggerPettingHeart();
            triggerFeedProp(action, nextBubbleText);
        }
        bubbleText = nextBubbleText;
        clearTimeout(resultTimer);
        resultTimer = setTimeout(() => resetIdleTimer(), RESULT_DISPLAY_TIME);
    }

    function clearIdleMotionTimer() {
        if (idleMotionTimer) clearTimeout(idleMotionTimer);
        idleMotionTimer = undefined;
    }

    function clearPointerReleaseTimer() {
        if (pointerReleaseTimer) clearTimeout(pointerReleaseTimer);
        pointerReleaseTimer = undefined;
    }

    function clearHeartTimer() {
        if (heartTimer) clearTimeout(heartTimer);
        heartTimer = undefined;
    }

    function clearFeedPropTimer() {
        if (feedPropTimer) clearTimeout(feedPropTimer);
        feedPropTimer = undefined;
    }

    function clearClickHintTimer() {
        if (clickHintTimer) clearTimeout(clickHintTimer);
        clickHintTimer = undefined;
    }

    function triggerClickHint() {
        if (!showClickHint) return;
        clickHintText = MASCOT_CLICK_HINT;
        clearClickHintTimer();
        clickHintTimer = setTimeout(() => {
            clickHintText = '';
        }, CLICK_HINT_DISPLAY_TIME);
    }

    function triggerFeedProp(action: string, bubble: string) {
        const feedProp = getFeedProp(action, bubble, mascotItemEmoji, mascotItemType);
        if (!feedProp) return;
        feedPropSeq += 1;
        feedPropVisible = true;
        feedPropEmoji = feedProp.emoji;
        feedPropKind = feedProp.kind;
        clearFeedPropTimer();
        feedPropTimer = setTimeout(() => {
            feedPropVisible = false;
            feedPropEmoji = '';
            feedPropKind = 'none';
        }, FEED_PROP_DISPLAY_TIME);
    }

    function shouldCycleIdleMotion() {
        return mounted && state === 'idle' && pointerState === 'none' && !testModeEnabled;
    }

    function scheduleIdleMotion() {
        clearIdleMotionTimer();
        if (!shouldCycleIdleMotion()) {
            idleMotion = 'stand';
            return;
        }
        idleMotionTimer = setTimeout(() => {
            idleMotion = pickNextIdleMotion(idleMotion);
            scheduleIdleMotion();
        }, getIdleMotionDelayMs(idleMotion));
    }

    function setPointerState(next: PointerState) {
        clearPointerReleaseTimer();
        if (next !== 'none' && (idleMotion === 'lie' || idleMotion === 'sleep')) {
            idleMotion = 'stand';
        }
        pointerState = next;
        if (next === 'none') {
            scheduleIdleMotion();
            return;
        }
        clearIdleMotionTimer();
        if (next === 'pointer-release') {
            pointerReleaseTimer = setTimeout(() => {
                pointerState = 'none';
                scheduleIdleMotion();
            }, POINTER_RELEASE_TIME);
        }
    }

    function syncTestMode() {
        if (!mounted) return;
        if (testModeEnabled) {
            stopPolling();
            clearIdleMotionTimer();
            testRunner?.start();
            return;
        }
        testRunner?.stop();
        stopPolling();
        startPolling();
        setIdle();
        scheduleIdleMotion();
    }

    function loadPosition() {
        const { x, y } = loadPuppyPosition(window.innerWidth, window.innerHeight);
        posX = x;
        posY = y;
    }

    function savePosition() {
        savePuppyPosition({ x: posX, y: posY });
    }

    function onMouseDown(e: MouseEvent) {
        dragSession = startDrag(e.clientX, e.clientY, posX, posY);
        setPointerState('pointer-down');
        e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
        if (!dragSession) return;
        const moved = moveDrag(dragSession, e.clientX, e.clientY);
        dragSession = moved.session;
        posX = moved.posX;
        posY = moved.posY;
        setPointerState(moved.pointerState);
    }

    function triggerPettingHeart() {
        heartBurstSeq += 1;
        heartBurstVisible = true;
        clearHeartTimer();
        heartTimer = setTimeout(() => {
            heartBurstVisible = false;
        }, HEART_DISPLAY_TIME);
    }

    function onMouseUp() {
        if (!dragSession) return;
        const shouldSave = dragSession.pointerMoved;
        if (shouldSave) {
            savePosition();
        } else {
            posX = dragSession.baseX;
            posY = dragSession.baseY;
            triggerPettingHeart();
            triggerClickHint();
        }
        dragSession = null;
        setPointerState('pointer-release');
    }

    function setIdle() {
        state = 'idle';
        resultState = 'none';
        toolVariant = 'none';
        toolAction = '';
        showWageCard = false;
        bubbleText = '';
        scheduleIdleMotion();
    }

    function clearTransientDisplayState() {
        setIdle();
        balance = 0;
        mascotItemLabel = '';
        mascotItemType = '';
        mascotItemEmoji = '';
        heartBurstVisible = false;
        feedPropVisible = false;
        feedPropEmoji = '';
        feedPropKind = 'none';
        clickHintText = '';
    }

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        clearIdleMotionTimer();
        idleTimer = setTimeout(() => {
            setIdle();
        }, IDLE_TIMEOUT);
    }

    function stopPolling() {
        poller?.stop();
    }

    function startPolling() {
        if (testModeEnabled || !visible) return;
        poller?.start();
    }

    function handlePolledEvent(event: PuppyEventPayload) {
        if (testModeEnabled) return;
        balance = event.balance;
        mascotItemLabel = event.itemLabel ?? '';
        mascotItemType = event.itemType ?? '';
        mascotItemEmoji = event.itemEmoji ?? '';
        if (event.seq <= lastSeq) return;
        lastSeq = event.seq;

        const tool = event.tool || '';
        const action = event.action || 'unknown';
        const status = event.status || 'running';
        const nextTool = resolveToolVariant(tool);

        if (status === 'running') {
            state = resolveActionState(action);
            resultState = 'none';
            toolVariant = nextTool;
            toolAction = action;
            showWageCard = shouldShowBalanceCard(tool, action) || shouldShowWageCard();
            bubbleText = formatBubbleText(tool, action, status, bubbleMeta());
            clearTimeout(resultTimer);
            resetIdleTimer();
        } else if (status === 'success') {
            state = resolveActionState(action);
            resultState = 'success';
            toolVariant = nextTool;
            toolAction = action;
            const nextBubbleText = formatBubbleText(tool, action, status, bubbleMeta());
            if (tool === 'mascot' && action !== 'get_balance') {
                triggerPettingHeart();
                triggerFeedProp(action, nextBubbleText);
            }
            bubbleText = nextBubbleText;
            clearTimeout(resultTimer);
            resultTimer = setTimeout(() => resetIdleTimer(), RESULT_DISPLAY_TIME);
        } else if (status === 'error') {
            state = resolveActionState(action);
            resultState = 'error';
            toolVariant = nextTool;
            toolAction = action;
            bubbleText = formatBubbleText(tool, action, status, bubbleMeta());
            clearTimeout(resultTimer);
            resultTimer = setTimeout(() => resetIdleTimer(), RESULT_DISPLAY_TIME);
        }
    }

    function startBlink() {
        blinkTimer = setInterval(() => {
            if (state === 'idle' || state === 'reading') {
                blinking = true;
                setTimeout(() => { blinking = false; }, 160);
            }
        }, 2600);
    }

    onMount(() => {
        mounted = true;
        testRunner = createTestModeRunner({
            pickAction: pickRandomAction,
            applyEvent: applyDisplayEvent,
            getIntervalMs: () => testModeIntervalMs,
            successWeight: TEST_SUCCESS_WEIGHT,
        });
        poller = createJsonFilePoller({
            endpoint: API_FILE_ENDPOINT,
            path: EVENTS_PATH,
            intervalMs: POLL_INTERVAL,
            parse: parsePuppyEventPayload,
            onValue: handlePolledEvent,
        });
        loadPosition();
        startPolling();
        startBlink();
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        syncTestMode();
        scheduleIdleMotion();
    });

    onDestroy(() => {
        stopPolling();
        clearInterval(blinkTimer);
        testRunner?.stop();
        clearIdleMotionTimer();
        clearPointerReleaseTimer();
        clearHeartTimer();
        clearFeedPropTimer();
        clearClickHintTimer();
        clearTimeout(idleTimer);
        clearTimeout(resultTimer);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    });

    $: isSleeping = state === 'idle' && idleMotion === 'sleep';
    $: if (mounted) {
        if (visible && !testModeEnabled) {
            startPolling();
        } else {
            stopPolling();
            if (!visible) {
                clearTransientDisplayState();
            }
        }
    }
    $: eyeState = isSleeping ? 'blink' :
        blinking ? 'blink' :
        resultState === 'success' ? 'happy' :
        resultState === 'error' ? 'sad' :
        state === 'dangerous' ? 'danger' :
        state === 'reading' ? 'flat' :
        'normal';

    $: containerClass = state === 'idle' ? 'sy-puppy--idle' :
        state === 'reading' ? 'sy-puppy--reading' :
        state === 'writing' ? 'sy-puppy--writing' :
        state === 'deleting' ? 'sy-puppy--deleting' :
        state === 'moving' ? 'sy-puppy--moving' :
        state === 'dangerous' ? 'sy-puppy--dangerous' :
        'sy-puppy--idle';

    $: bubbleToneClass = resultState === 'error' ? 'sy-puppy__bubble--error' : '';

    $: bubblePositionClass = toolVariant === 'search' || toolVariant === 'block' || toolVariant === 'system' || toolVariant === 'av'
        ? 'sy-puppy__bubble--high sy-puppy__bubble--left'
        : toolVariant === 'notebook' || toolVariant === 'document'
            ? 'sy-puppy__bubble--right'
            : toolVariant === 'file' || toolVariant === 'tag' || toolVariant === 'mascot'
                ? 'sy-puppy__bubble--left'
                : '';

    $: bubbleOffsetClass = resultState === 'error' ? 'sy-puppy__bubble--error-offset' : '';
    $: bubbleTailClass = toolVariant === 'notebook' || toolVariant === 'document'
        ? 'sy-puppy__bubble--tail-right'
        : toolVariant === 'search' || toolVariant === 'block' || toolVariant === 'system' || toolVariant === 'av' || toolVariant === 'file' || toolVariant === 'tag' || toolVariant === 'mascot'
            ? 'sy-puppy__bubble--tail-left'
            : 'sy-puppy__bubble--tail-center';

    $: idleMotionClass = state === 'idle' ? `sy-puppy--idle-${idleMotion}` : '';
    $: pointerClass = pointerState !== 'none' ? `sy-puppy--${pointerState}` : '';
    $: toolClass = toolVariant !== 'none'
        ? `sy-puppy--tool-${toolVariant} ${toolAction ? `sy-puppy--action-${toolVariant}-${toolAction}` : ''}`
        : '';
    $: wageCardClass = showWageCard ? 'sy-puppy--show-wage-card' : '';
    $: mounted, testModeEnabled, testModeIntervalMs, visible, syncTestMode();
</script>

{#if visible}
<div
    class="sy-puppy {containerClass} {idleMotionClass} {pointerClass} {toolClass} {wageCardClass}"
    style="left: {posX}px; top: {posY}px;"
    on:mousedown={onMouseDown}
    role="status"
    aria-label="Tool call status"
>
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

    {#if isSleeping}
    <div class="sy-puppy__sleep-zzz" aria-hidden="true">
        <span class="sy-puppy__sleep-z sy-puppy__sleep-z--1">z</span>
        <span class="sy-puppy__sleep-z sy-puppy__sleep-z--2">Z</span>
        <span class="sy-puppy__sleep-z sy-puppy__sleep-z--3">Z</span>
    </div>
    {/if}

    <div class="sy-puppy__char">
        <svg viewBox="0 0 96 96" width="52" height="52" xmlns="http://www.w3.org/2000/svg" overflow="visible">
            <g class="sy-puppy__cat">
                <rect x="18" y="0" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="0" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="6" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="6" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="6" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="6" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="0" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="0" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="6" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="6" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="6" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="6" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="12" width="6" height="6" fill="#4a7fff"/>
                <rect x="6" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="84" y="18" width="6" height="6" fill="#4a7fff"/>
                <rect x="6" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="84" y="24" width="6" height="6" fill="#4a7fff"/>
                <rect x="6" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="84" y="30" width="6" height="6" fill="#4a7fff"/>
                <rect x="6" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="84" y="36" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="42" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="48" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="54" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="60" width="6" height="6" fill="#4a7fff"/>
                <rect x="12" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="24" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="30" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="36" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="42" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="48" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="54" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="60" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="66" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="72" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="78" y="66" width="6" height="6" fill="#4a7fff"/>
                <rect x="18" y="72" width="6" height="6" fill="#3060d0" class="sy-puppy__paw sy-puppy__paw--left"/>
                <rect x="24" y="72" width="6" height="6" fill="#3060d0" class="sy-puppy__paw sy-puppy__paw--left"/>
                <rect x="18" y="78" width="6" height="6" fill="#3060d0" class="sy-puppy__paw sy-puppy__paw--left"/>
                <rect x="24" y="78" width="6" height="6" fill="#3060d0" class="sy-puppy__paw sy-puppy__paw--left"/>
                <rect x="66" y="72" width="6" height="6" fill="#3060d0" class="sy-puppy__paw sy-puppy__paw--right"/>
                <rect x="72" y="72" width="6" height="6" fill="#3060d0" class="sy-puppy__paw sy-puppy__paw--right"/>
                <rect x="66" y="78" width="6" height="6" fill="#3060d0" class="sy-puppy__paw sy-puppy__paw--right"/>
                <rect x="72" y="78" width="6" height="6" fill="#3060d0" class="sy-puppy__paw sy-puppy__paw--right"/>
                <rect x="84" y="60" width="6" height="6" fill="#4a7fff" class="sy-puppy__tail sy-puppy__tail--1"/>
                <rect x="84" y="66" width="6" height="6" fill="#4a7fff" class="sy-puppy__tail sy-puppy__tail--2"/>
                <rect x="90" y="72" width="6" height="6" fill="#4a7fff" class="sy-puppy__tail sy-puppy__tail--3"/>

                <g class="sy-puppy__eyes">
                    {#if eyeState === 'blink'}
                        <rect x="18" y="24" width="12" height="3" fill="#1a1f3c"/>
                        <rect x="66" y="24" width="12" height="3" fill="#1a1f3c"/>
                    {:else if eyeState === 'happy'}
                        <rect x="20" y="20" width="8" height="4" fill="#1a1f3c"/>
                        <rect x="68" y="20" width="8" height="4" fill="#1a1f3c"/>
                    {:else if eyeState === 'sad'}
                        <rect x="20" y="28" width="8" height="4" fill="#1a1f3c"/>
                        <rect x="68" y="28" width="8" height="4" fill="#1a1f3c"/>
                    {:else if eyeState === 'danger'}
                        <line x1="18" y1="24" x2="30" y2="36" stroke="#1a1f3c" stroke-width="3" class="sy-puppy__eye-x"/>
                        <line x1="30" y1="24" x2="18" y2="36" stroke="#1a1f3c" stroke-width="3" class="sy-puppy__eye-x"/>
                        <line x1="66" y1="24" x2="78" y2="36" stroke="#1a1f3c" stroke-width="3" class="sy-puppy__eye-x"/>
                        <line x1="78" y1="24" x2="66" y2="36" stroke="#1a1f3c" stroke-width="3" class="sy-puppy__eye-x"/>
                    {:else if eyeState === 'flat'}
                        <rect x="18" y="27" width="12" height="2" fill="#1a1f3c"/>
                        <rect x="66" y="27" width="12" height="2" fill="#1a1f3c"/>
                    {:else}
                        <rect x="18" y="24" width="6" height="6" fill="#1a1f3c"/>
                        <rect x="24" y="24" width="6" height="6" fill="#1a1f3c"/>
                        <rect x="66" y="24" width="6" height="6" fill="#1a1f3c"/>
                        <rect x="72" y="24" width="6" height="6" fill="#1a1f3c"/>
                    {/if}
                </g>
            </g>

            <g class="sy-puppy__tools">
                <g class="sy-puppy__prop sy-puppy__tool sy-puppy__tool--notebook">
                    <rect x="-42" y="24" width="30" height="36" rx="3" fill="#6f7cff" stroke="#1a1f3c" stroke-width="2"/>
                    <rect x="-14" y="24" width="4" height="36" rx="1.5" fill="#4d5ce0" stroke="#1a1f3c" stroke-width="1"/>
                    <line x1="-34" y1="34" x2="-22" y2="34" stroke="#dfe4ff" stroke-width="2"/>
                    <line x1="-34" y1="41" x2="-20" y2="41" stroke="#dfe4ff" stroke-width="2"/>
                    <line x1="-34" y1="48" x2="-22" y2="48" stroke="#dfe4ff" stroke-width="2"/>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--notebook-create sy-puppy__tool-mark--notebook-open">
                        <line x1="-36" y1="28" x2="-28" y2="28" stroke="#c4ff72" stroke-width="2"/>
                        <line x1="-32" y1="24" x2="-32" y2="32" stroke="#c4ff72" stroke-width="2"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--notebook-close sy-puppy__tool-mark--notebook-remove">
                        <line x1="-36" y1="26" x2="-28" y2="34" stroke="#ff9aa8" stroke-width="2"/>
                        <line x1="-28" y1="26" x2="-36" y2="34" stroke="#ff9aa8" stroke-width="2"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--notebook-rename sy-puppy__tool-mark--notebook-set_icon">
                        <rect x="-37" y="26" width="8" height="8" fill="#ffd040" stroke="#1a1f3c" stroke-width="1"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--notebook-list sy-puppy__tool-mark--notebook-get_child_docs">
                        <line x1="-38" y1="27" x2="-27" y2="27" stroke="#fff" stroke-width="2"/>
                        <line x1="-38" y1="31" x2="-27" y2="31" stroke="#fff" stroke-width="2"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--notebook-get_conf sy-puppy__tool-mark--notebook-set_conf">
                        <circle cx="-33" cy="30" r="4" fill="#d9f4ff" stroke="#1a1f3c" stroke-width="1"/>
                        <rect x="-34.5" y="25" width="3" height="2" fill="#1a1f3c"/>
                        <rect x="-34.5" y="33" width="3" height="2" fill="#1a1f3c"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--notebook-get_permissions sy-puppy__tool-mark--notebook-set_permission">
                        <rect x="-37" y="25" width="8" height="9" fill="#ffd040" stroke="#1a1f3c" stroke-width="1"/>
                        <path d="M-35 25v-2a2 2 0 0 1 4 0v2" fill="none" stroke="#1a1f3c" stroke-width="1"/>
                    </g>
                </g>

                <g class="sy-puppy__prop sy-puppy__tool sy-puppy__tool--document">
                    <rect x="-42" y="4" width="28" height="34" fill="#fff" stroke="#1a1f3c" stroke-width="2"/>
                    <polygon points="-22,4 -14,12 -22,12" fill="#d7ddea"/>
                    <line x1="-36" y1="16" x2="-20" y2="16" stroke="#b0b8d0" stroke-width="2"/>
                    <line x1="-36" y1="24" x2="-19" y2="24" stroke="#b0b8d0" stroke-width="2"/>
                    <line x1="-36" y1="32" x2="-22" y2="32" stroke="#b0b8d0" stroke-width="2"/>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--document-create sy-puppy__tool-mark--document-create_daily_note">
                        <rect x="-39" y="7" width="10" height="10" fill="#c4ff72" stroke="#1a1f3c" stroke-width="1"/>
                        <line x1="-34" y1="9" x2="-34" y2="15" stroke="#1a1f3c" stroke-width="1.4"/>
                        <line x1="-37" y1="12" x2="-31" y2="12" stroke="#1a1f3c" stroke-width="1.4"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--document-search_docs sy-puppy__tool-mark--document-get_doc">
                        <circle cx="-33" cy="12" r="4" fill="#d9f4ff" stroke="#1a1f3c" stroke-width="1"/>
                        <line x1="-30" y1="15" x2="-27" y2="18" stroke="#1a1f3c" stroke-width="1.5"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--document-move sy-puppy__tool-mark--document-rename">
                        <line x1="-37" y1="11" x2="-29" y2="11" stroke="#ff9500" stroke-width="2"/>
                        <polygon points="-30,8 -26,11 -30,14" fill="#ff9500"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--document-remove">
                        <line x1="-37" y1="8" x2="-29" y2="16" stroke="#ff4d6d" stroke-width="2"/>
                        <line x1="-29" y1="8" x2="-37" y2="16" stroke="#ff4d6d" stroke-width="2"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--document-get_path sy-puppy__tool-mark--document-get_hpath sy-puppy__tool-mark--document-get_ids">
                        <circle cx="-34" cy="12" r="3" fill="#8fd2ff" stroke="#1a1f3c" stroke-width="1"/>
                        <line x1="-31" y1="15" x2="-28" y2="18" stroke="#1a1f3c" stroke-width="1.5"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--document-get_child_blocks sy-puppy__tool-mark--document-get_child_docs sy-puppy__tool-mark--document-list_tree">
                        <line x1="-38" y1="9" x2="-34" y2="9" stroke="#17b26a" stroke-width="1.5"/>
                        <line x1="-36" y1="9" x2="-36" y2="18" stroke="#17b26a" stroke-width="1.5"/>
                        <line x1="-36" y1="14" x2="-31" y2="14" stroke="#17b26a" stroke-width="1.5"/>
                        <line x1="-36" y1="18" x2="-31" y2="18" stroke="#17b26a" stroke-width="1.5"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--document-set_icon sy-puppy__tool-mark--document-set_cover sy-puppy__tool-mark--document-clear_cover">
                        <rect x="-39" y="7" width="11" height="8" fill="#ffd040" stroke="#1a1f3c" stroke-width="1"/>
                        <polygon points="-38,14 -35,10 -32,13 -29,9 -28,15 -39,15" fill="#4a7fff"/>
                    </g>
                </g>

                <g class="sy-puppy__prop sy-puppy__tool sy-puppy__tool--block">
                    <rect x="8" y="-34" width="20" height="10" fill="#ff9500" stroke="#1a1f3c" stroke-width="1.5"/>
                    <rect x="28" y="-34" width="20" height="10" fill="#e08000" stroke="#1a1f3c" stroke-width="1.5"/>
                    <rect x="18" y="-24" width="20" height="10" fill="#ffb74d" stroke="#1a1f3c" stroke-width="1.5"/>
                    <rect x="38" y="-24" width="20" height="10" fill="#ff9500" stroke="#1a1f3c" stroke-width="1.5"/>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--block-insert sy-puppy__tool-mark--block-prepend sy-puppy__tool-mark--block-append">
                        <rect x="44" y="-41" width="10" height="10" fill="#c4ff72" stroke="#1a1f3c" stroke-width="1"/>
                        <line x1="49" y1="-39" x2="49" y2="-33" stroke="#1a1f3c" stroke-width="1.4"/>
                        <line x1="46" y1="-36" x2="52" y2="-36" stroke="#1a1f3c" stroke-width="1.4"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--block-update sy-puppy__tool-mark--block-set_attrs">
                        <rect x="44" y="-41" width="10" height="10" fill="#6f7cff" stroke="#1a1f3c" stroke-width="1"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--block-delete">
                        <line x1="45" y1="-40" x2="53" y2="-32" stroke="#ff4d6d" stroke-width="2"/>
                        <line x1="53" y1="-40" x2="45" y2="-32" stroke="#ff4d6d" stroke-width="2"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--block-move sy-puppy__tool-mark--block-transfer_ref">
                        <line x1="44" y1="-36" x2="54" y2="-36" stroke="#8fd2ff" stroke-width="2"/>
                        <polygon points="51,-39 56,-36 51,-33" fill="#8fd2ff"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--block-fold sy-puppy__tool-mark--block-unfold">
                        <polygon points="45,-40 53,-40 49,-33" fill="#ffd040" stroke="#1a1f3c" stroke-width="1"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--block-get_kramdown sy-puppy__tool-mark--block-dom">
                        <text x="44" y="-33" font-size="8" font-family="monospace" font-weight="700" fill="#6f7cff">MD</text>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--block-get_children sy-puppy__tool-mark--block-breadcrumb">
                        <line x1="45" y1="-39" x2="49" y2="-39" stroke="#17b26a" stroke-width="1.5"/>
                        <line x1="47" y1="-39" x2="47" y2="-31" stroke="#17b26a" stroke-width="1.5"/>
                        <line x1="47" y1="-35" x2="53" y2="-35" stroke="#17b26a" stroke-width="1.5"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--block-get_attrs sy-puppy__tool-mark--block-info">
                        <circle cx="49" cy="-36" r="4" fill="#d9f4ff" stroke="#1a1f3c" stroke-width="1"/>
                        <text x="47" y="-33" font-size="6" font-family="monospace" font-weight="700" fill="#1a1f3c">i</text>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--block-exists sy-puppy__tool-mark--block-word_count sy-puppy__tool-mark--block-recent_updated">
                        <circle cx="49" cy="-36" r="4" fill="#c4ff72" stroke="#1a1f3c" stroke-width="1"/>
                    </g>
                </g>

                <g class="sy-puppy__prop sy-puppy__tool sy-puppy__tool--av">
                    <rect x="78" y="-28" width="34" height="28" rx="3" fill="#eff4ff" stroke="#1a1f3c" stroke-width="2"/>
                    <rect x="78" y="-28" width="34" height="6" rx="2" fill="#6f7cff" stroke="#1a1f3c" stroke-width="1.5"/>
                    <line x1="89" y1="-22" x2="89" y2="0" stroke="#9db2ff" stroke-width="1.5"/>
                    <line x1="100" y1="-22" x2="100" y2="0" stroke="#9db2ff" stroke-width="1.5"/>
                    <line x1="78" y1="-14" x2="112" y2="-14" stroke="#9db2ff" stroke-width="1.5"/>
                    <line x1="78" y1="-7" x2="112" y2="-7" stroke="#9db2ff" stroke-width="1.5"/>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--av-get sy-puppy__tool-mark--av-search sy-puppy__tool-mark--av-get_primary_key_values">
                        <circle cx="106" cy="-22" r="4" fill="#d9f4ff" stroke="#1a1f3c" stroke-width="1"/>
                        <line x1="109" y1="-19" x2="112" y2="-16" stroke="#1a1f3c" stroke-width="1.5"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--av-add_rows sy-puppy__tool-mark--av-duplicate_block">
                        <rect x="102" y="-27" width="8" height="8" fill="#c4ff72" stroke="#1a1f3c" stroke-width="1"/>
                        <line x1="106" y1="-25" x2="106" y2="-21" stroke="#1a1f3c" stroke-width="1.2"/>
                        <line x1="104" y1="-23" x2="108" y2="-23" stroke="#1a1f3c" stroke-width="1.2"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--av-remove_rows sy-puppy__tool-mark--av-remove_column">
                        <line x1="102" y1="-26" x2="110" y2="-18" stroke="#ff4d6d" stroke-width="2"/>
                        <line x1="110" y1="-26" x2="102" y2="-18" stroke="#ff4d6d" stroke-width="2"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--av-add_column">
                        <line x1="104" y1="-27" x2="104" y2="-18" stroke="#ffd040" stroke-width="2"/>
                        <line x1="100" y1="-23" x2="108" y2="-23" stroke="#ffd040" stroke-width="2"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--av-set_cell sy-puppy__tool-mark--av-batch_set_cells">
                        <rect x="102" y="-27" width="8" height="8" fill="#8fd2ff" stroke="#1a1f3c" stroke-width="1"/>
                        <rect x="104" y="-25" width="4" height="4" fill="#1a1f3c"/>
                    </g>
                </g>

                <g class="sy-puppy__prop sy-puppy__tool sy-puppy__tool--file">
                    <rect x="90" y="52" width="32" height="28" fill="#ddeeff" stroke="#1a1f3c" stroke-width="2"/>
                    <rect x="93" y="48" width="26" height="8" fill="#c8dcff" stroke="#1a1f3c" stroke-width="1.5"/>
                    <line x1="98" y1="66" x2="112" y2="66" stroke="#1a1f3c" stroke-width="2.5" stroke-linecap="round"/>
                    <polygon points="110,61 118,66 110,71" fill="#1a1f3c"/>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--file-upload_asset">
                        <line x1="106" y1="75" x2="106" y2="60" stroke="#4a7fff" stroke-width="2.5"/>
                        <polygon points="106,56 101,62 111,62" fill="#4a7fff"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--file-export_md sy-puppy__tool-mark--file-export_resources">
                        <line x1="106" y1="58" x2="106" y2="73" stroke="#17b26a" stroke-width="2.5"/>
                        <polygon points="106,77 101,71 111,71" fill="#17b26a"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--file-render_template sy-puppy__tool-mark--file-render_sprig">
                        <text x="97" y="74" font-size="14" font-family="monospace" font-weight="700" fill="#6f7cff">{'{}'}</text>
                    </g>
                </g>

                <g class="sy-puppy__prop sy-puppy__tool sy-puppy__tool--search">
                    <circle cx="48" cy="-16" r="12" fill="rgba(220, 244, 255, 0.9)" stroke="#1a1f3c" stroke-width="3.5"/>
                    <circle cx="44" cy="-20" r="4" fill="rgba(255,255,255,0.85)"/>
                    <circle cx="48" cy="-16" r="8.5" fill="none" stroke="#8fd2ff" stroke-width="2"/>
                    <line x1="58" y1="-6" x2="72" y2="8" stroke="#1a1f3c" stroke-width="4" stroke-linecap="round"/>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--search-fulltext">
                        <text x="40" y="-12" font-size="9" font-family="monospace" font-weight="700" fill="#4a7fff">T</text>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--search-query_sql">
                        <text x="38" y="-12" font-size="8" font-family="monospace" font-weight="700" fill="#ff9500">SQL</text>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--search-search_tag">
                        <text x="40" y="-12" font-size="9" font-family="monospace" font-weight="700" fill="#17b26a">#</text>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--search-get_backlinks sy-puppy__tool-mark--search-get_backmentions">
                        <text x="40" y="-12" font-size="9" font-family="monospace" font-weight="700" fill="#6f7cff">↩</text>
                    </g>
                </g>

                <g class="sy-puppy__prop sy-puppy__tool sy-puppy__tool--tag">
                    <path d="M96 10h22l8 12-8 12H96z" fill="#ffd040" stroke="#1a1f3c" stroke-width="2"/>
                    <circle cx="104" cy="22" r="3" fill="#fff" stroke="#1a1f3c" stroke-width="1.2"/>
                    <line x1="96" y1="22" x2="86" y2="22" stroke="#1a1f3c" stroke-width="2"/>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--tag-list">
                        <line x1="110" y1="17" x2="118" y2="17" stroke="#fff" stroke-width="2"/>
                        <line x1="110" y1="22" x2="118" y2="22" stroke="#fff" stroke-width="2"/>
                        <line x1="110" y1="27" x2="118" y2="27" stroke="#fff" stroke-width="2"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--tag-rename">
                        <rect x="112" y="16" width="5" height="10" fill="#4a7fff"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--tag-remove">
                        <line x1="111" y1="18" x2="118" y2="25" stroke="#ff4d6d" stroke-width="2"/>
                        <line x1="118" y1="18" x2="111" y2="25" stroke="#ff4d6d" stroke-width="2"/>
                    </g>
                </g>

                <g class="sy-puppy__prop sy-puppy__tool sy-puppy__tool--system">
                    <rect x="90" y="-10" width="32" height="30" rx="3" fill="#d9f4ff" stroke="#1a1f3c" stroke-width="2"/>
                    <circle cx="106" cy="4" r="7" fill="#8fd2ff" stroke="#1a1f3c" stroke-width="1.5"/>
                    <line x1="106" y1="4" x2="112" y2="-1" stroke="#1a1f3c" stroke-width="1.8" stroke-linecap="round"/>
                    <line x1="95" y1="15" x2="117" y2="15" stroke="#1a1f3c" stroke-width="2"/>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--system-push_msg">
                        <circle cx="116" cy="-2" r="4" fill="#17b26a" stroke="#1a1f3c" stroke-width="1"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--system-push_err_msg">
                        <circle cx="116" cy="-2" r="4" fill="#ff4d6d" stroke="#1a1f3c" stroke-width="1"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--system-network">
                        <path d="M98 -4 L102 -8 L106 -4 L110 -8 L114 -4" fill="none" stroke="#4a7fff" stroke-width="1.5"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--system-conf sy-puppy__tool-mark--system-sys_fonts">
                        <rect x="113" y="-6" width="5" height="5" fill="#ffd040" stroke="#1a1f3c" stroke-width="1"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--system-workspace_info">
                        <rect x="112" y="-7" width="8" height="8" fill="#c8dcff" stroke="#1a1f3c" stroke-width="1"/>
                        <path d="M112 1h8l-2 3h-10z" fill="#8fd2ff" stroke="#1a1f3c" stroke-width="1"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--system-changelog">
                        <line x1="112" y1="-5" x2="119" y2="-5" stroke="#fff" stroke-width="1.6"/>
                        <line x1="112" y1="-1" x2="119" y2="-1" stroke="#fff" stroke-width="1.6"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--system-boot_progress">
                        <rect x="111" y="-6" width="10" height="4" fill="#fff" stroke="#1a1f3c" stroke-width="1"/>
                        <rect x="112" y="-5" width="6" height="2" fill="#17b26a"/>
                    </g>
                    <g class="sy-puppy__tool-mark sy-puppy__tool-mark--system-get_version sy-puppy__tool-mark--system-get_current_time">
                        <text x="113" y="0" font-size="7" font-family="monospace" font-weight="700" fill="#6f7cff">v</text>
                    </g>
                </g>

                <g class="sy-puppy__prop sy-puppy__wage-card">
                    <rect x="28" y="55" width="38" height="24" rx="3" fill="#6f7cff" stroke="#1a1f3c" stroke-width="2"/>
                    <rect x="31" y="59" width="32" height="4" rx="1" fill="#dfe8ff"/>
                    <rect x="32" y="67" width="8" height="6" rx="1" fill="#ffd78c" stroke="#1a1f3c" stroke-width="1"/>
                    <rect x="44" y="68" width="7" height="2" fill="#dfe8ff"/>
                    <rect x="44" y="72" width="10" height="2" fill="#dfe8ff"/>
                    <text x="58" y="75" text-anchor="end" font-size="8" font-family="monospace" font-weight="700" fill="#ffffff">{balance}</text>
                </g>
            </g>

            {#if state === 'deleting' || state === 'dangerous'}
            <g class="sy-puppy__overlay sy-puppy__overlay--alert">
                <circle class="sy-puppy__sweat" cx="84" cy="30" r="3" fill="#8fd2ff"/>
            </g>
            {/if}

            {#if state === 'deleting'}
            <g class="sy-puppy__overlay sy-puppy__overlay--delete">
                <line x1="75" y1="-24" x2="93" y2="-6" stroke="#ff4d6d" stroke-width="5" stroke-linecap="round"/>
                <line x1="93" y1="-24" x2="75" y2="-6" stroke="#ff4d6d" stroke-width="5" stroke-linecap="round"/>
            </g>
            {/if}

            {#if state === 'dangerous'}
            <g class="sy-puppy__overlay sy-puppy__overlay--danger">
                <rect x="81" y="-30" width="9" height="18" rx="3" fill="#ffd040" stroke="#1a1f3c" stroke-width="1.5"/>
                <circle cx="85" cy="-4" r="5" fill="#ffd040" stroke="#1a1f3c" stroke-width="1.5"/>
            </g>
            {/if}

            {#if resultState === 'error'}
            <g class="sy-puppy__error-mark">
                <line x1="12" y1="12" x2="24" y2="24" stroke="#ff4d6d" stroke-width="3" stroke-linecap="round"/>
                <line x1="24" y1="12" x2="12" y2="24" stroke="#ff4d6d" stroke-width="3" stroke-linecap="round"/>
            </g>
            {/if}
        </svg>
    </div>
</div>
{/if}

<style>
    .sy-puppy {
        position: fixed;
        z-index: 9999;
        cursor: grab;
        user-select: none;
    }

    .sy-puppy:active {
        cursor: grabbing;
    }

    .sy-puppy__hearts {
        position: absolute;
        left: 12px;
        bottom: calc(100% + 6px);
        width: 44px;
        height: 42px;
        pointer-events: none;
    }

    .sy-puppy__heart {
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

    .sy-puppy__heart--main {
        left: 12px;
        bottom: 0;
    }

    .sy-puppy__heart--side {
        left: 0;
        bottom: 6px;
        font-size: 14px;
        animation-duration: 0.88s;
        animation-delay: 0.06s;
    }

    .sy-puppy__feed-prop {
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

    .sy-puppy__feed-prop span {
        display: block;
        font-size: 20px;
        line-height: 1;
        filter: drop-shadow(0 2px 0 rgba(26, 31, 60, 0.18));
    }

    .sy-puppy__feed-prop--food {
        transform-origin: 12px 20px;
    }

    .sy-puppy__feed-prop--drink {
        left: 46px;
        top: 14px;
        transform-origin: 14px 20px;
    }

    .sy-puppy__sleep-zzz {
        position: absolute;
        right: -2px;
        top: -22px;
        width: 34px;
        height: 28px;
        pointer-events: none;
        z-index: 4;
    }

    .sy-puppy__sleep-z {
        position: absolute;
        display: block;
        color: #5f74b8;
        font-weight: 700;
        line-height: 1;
        text-shadow:
            -1px 0 #eef3ff,
            1px 0 #eef3ff,
            0 -1px #eef3ff,
            0 1px #eef3ff;
        image-rendering: pixelated;
        animation: sy-puppy-sleep-z 2.1s ease-out infinite;
    }

    .sy-puppy__sleep-z--1 {
        left: 0;
        bottom: 0;
        font-size: 11px;
    }

    .sy-puppy__sleep-z--2 {
        left: 10px;
        bottom: 7px;
        font-size: 13px;
        animation-delay: 0.32s;
    }

    .sy-puppy__sleep-z--3 {
        left: 22px;
        bottom: 15px;
        font-size: 15px;
        animation-delay: 0.64s;
    }

    .sy-puppy__bubble {
        position: absolute;
        bottom: calc(100% + 22px);
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 10px;
        border: 2px solid var(--sy-puppy-bubble-border, var(--b3-border-color, #d7ddea));
        border-radius: 0;
        background: var(--sy-puppy-bubble-fill, color-mix(in srgb, var(--b3-theme-surface, #fff) 94%, #eef3ff));
        color: var(--b3-theme-on-surface, #30425f);
        box-shadow: 4px 4px 0 rgba(48, 66, 95, 0.18);
        font-size: 11px;
        line-height: 1.2;
        white-space: nowrap;
        pointer-events: none;
        image-rendering: pixelated;
        animation: sy-puppy-bubble-in 0.18s steps(3);
    }

    .sy-puppy__bubble--left {
        transform: translateX(calc(-50% - 26px));
    }

    .sy-puppy__bubble--right {
        transform: translateX(calc(-50% + 26px));
    }

    .sy-puppy__bubble--high {
        bottom: calc(100% + 42px);
    }

    .sy-puppy__bubble--error-offset {
        bottom: calc(100% + 34px);
    }

    .sy-puppy__bubble--high.sy-puppy__bubble--error-offset {
        bottom: calc(100% + 52px);
    }

    .sy-puppy__bubble--wage-card {
        left: 6px;
        top: calc(100% + 30px);
        bottom: auto;
        transform: none;
        padding: 5px 8px;
        color: #23345d;
        background: color-mix(in srgb, var(--b3-theme-surface, #fff) 90%, #dfe8ff);
        border-color: #8ea8eb;
        box-shadow: 3px 3px 0 rgba(48, 66, 95, 0.16);
        animation: sy-puppy-bubble-in-down 0.18s steps(3);
    }

    .sy-puppy__bubble--wage-card span {
        color: #1f315c;
        font-weight: 700;
        text-shadow:
            -1px 0 rgba(255, 255, 255, 0.85),
            1px 0 rgba(255, 255, 255, 0.85),
            0 -1px rgba(255, 255, 255, 0.85),
            0 1px rgba(255, 255, 255, 0.85);
    }

    .sy-puppy__bubble.sy-puppy__bubble--wage-card-tail::after {
        left: 34px;
        top: -11px;
        bottom: auto;
        transform: rotate(180deg);
    }

    .sy-puppy__bubble.sy-puppy__bubble--wage-card-tail::before {
        left: 34px;
        top: -13px;
        bottom: auto;
        transform: rotate(180deg);
    }

    .sy-puppy__bubble::after {
        content: '';
        position: absolute;
        top: 100%;
        width: 16px;
        height: 12px;
        background: var(--sy-puppy-bubble-fill, color-mix(in srgb, var(--b3-theme-surface, #fff) 94%, #eef3ff));
        clip-path: polygon(0 0, 100% 0, 100% 33%, 66% 33%, 66% 66%, 33% 66%, 33% 100%, 0 100%);
        z-index: 1;
    }

    .sy-puppy__bubble::before {
        content: '';
        position: absolute;
        top: calc(100% + 2px);
        width: 16px;
        height: 12px;
        background: var(--sy-puppy-bubble-border, var(--b3-border-color, #d7ddea));
        clip-path: polygon(0 0, 100% 0, 100% 33%, 66% 33%, 66% 66%, 33% 66%, 33% 100%, 0 100%);
        z-index: 0;
    }

    .sy-puppy__bubble--tail-left::before,
    .sy-puppy__bubble--tail-left::after {
        left: 16px;
    }

    .sy-puppy__bubble--tail-center::before,
    .sy-puppy__bubble--tail-center::after {
        left: calc(50% - 8px);
    }

    .sy-puppy__bubble--tail-right::before,
    .sy-puppy__bubble--tail-right::after {
        right: 16px;
    }

    .sy-puppy__bubble--tail-right::before,
    .sy-puppy__bubble--tail-right::after {
        transform: scaleX(-1);
    }

    .sy-puppy__bubble--error {
        --sy-puppy-bubble-border: #7f2430;
    }

    .sy-puppy__char {
        overflow: visible;
        filter: drop-shadow(0 8px 16px rgba(40, 59, 97, 0.18));
    }

    .sy-puppy__cat,
    .sy-puppy__prop,
    .sy-puppy__overlay,
    .sy-puppy__error-mark,
    .sy-puppy__sweat {
        transform-box: fill-box;
        transform-origin: center;
    }

    .sy-puppy__tail {
        transform-origin: 82px 65px;
    }

    .sy-puppy__paw {
        transform-origin: center top;
    }

    .sy-puppy__tool {
        opacity: 0;
        transition: opacity 0.12s ease;
    }

    .sy-puppy__tool-mark {
        opacity: 0;
        transform-box: fill-box;
        transform-origin: center;
        transition: opacity 0.12s ease;
        pointer-events: none;
    }

    .sy-puppy__tool-mark text {
        paint-order: stroke;
        stroke: rgba(26, 31, 60, 0.15);
        stroke-width: 0.6px;
    }

    .sy-puppy__tool--notebook { transform-origin: -26px 42px; }
    .sy-puppy__tool--document { transform-origin: -28px 22px; }
    .sy-puppy__tool--block { transform-origin: 34px -22px; }
    .sy-puppy__tool--av { transform-origin: 96px -14px; }
    .sy-puppy__tool--search { transform-origin: 48px -12px; }
    .sy-puppy__tool--file { transform-origin: 104px 66px; }
    .sy-puppy__tool--tag { transform-origin: 106px 22px; }
    .sy-puppy__tool--system { transform-origin: 106px 4px; }
    .sy-puppy__wage-card {
        opacity: 0;
        transform-box: fill-box;
        transform-origin: 46px 68px;
        pointer-events: none;
    }

    .sy-puppy--tool-notebook .sy-puppy__tool--notebook,
    .sy-puppy--tool-document .sy-puppy__tool--document,
    .sy-puppy--tool-block .sy-puppy__tool--block,
    .sy-puppy--tool-av .sy-puppy__tool--av,
    .sy-puppy--tool-file .sy-puppy__tool--file,
    .sy-puppy--tool-search .sy-puppy__tool--search,
    .sy-puppy--tool-tag .sy-puppy__tool--tag,
    .sy-puppy--tool-system .sy-puppy__tool--system {
        opacity: 1;
    }

    .sy-puppy--show-wage-card .sy-puppy__wage-card {
        opacity: 1;
        animation: sy-puppy-wage-card-show 0.42s steps(3);
    }

    .sy-puppy--action-notebook-create .sy-puppy__tool-mark--notebook-create,
    .sy-puppy--action-notebook-open .sy-puppy__tool-mark--notebook-open,
    .sy-puppy--action-notebook-close .sy-puppy__tool-mark--notebook-close,
    .sy-puppy--action-notebook-remove .sy-puppy__tool-mark--notebook-remove,
    .sy-puppy--action-notebook-rename .sy-puppy__tool-mark--notebook-rename,
    .sy-puppy--action-notebook-set_icon .sy-puppy__tool-mark--notebook-set_icon,
    .sy-puppy--action-notebook-list .sy-puppy__tool-mark--notebook-list,
    .sy-puppy--action-notebook-get_child_docs .sy-puppy__tool-mark--notebook-get_child_docs,
    .sy-puppy--action-notebook-get_conf .sy-puppy__tool-mark--notebook-get_conf,
    .sy-puppy--action-notebook-set_conf .sy-puppy__tool-mark--notebook-set_conf,
    .sy-puppy--action-notebook-get_permissions .sy-puppy__tool-mark--notebook-get_permissions,
    .sy-puppy--action-notebook-set_permission .sy-puppy__tool-mark--notebook-set_permission,
    .sy-puppy--action-document-create .sy-puppy__tool-mark--document-create,
    .sy-puppy--action-document-create_daily_note .sy-puppy__tool-mark--document-create_daily_note,
    .sy-puppy--action-document-search_docs .sy-puppy__tool-mark--document-search_docs,
    .sy-puppy--action-document-get_doc .sy-puppy__tool-mark--document-get_doc,
    .sy-puppy--action-document-move .sy-puppy__tool-mark--document-move,
    .sy-puppy--action-document-rename .sy-puppy__tool-mark--document-rename,
    .sy-puppy--action-document-remove .sy-puppy__tool-mark--document-remove,
    .sy-puppy--action-document-get_path .sy-puppy__tool-mark--document-get_path,
    .sy-puppy--action-document-get_hpath .sy-puppy__tool-mark--document-get_hpath,
    .sy-puppy--action-document-get_ids .sy-puppy__tool-mark--document-get_ids,
    .sy-puppy--action-document-get_child_blocks .sy-puppy__tool-mark--document-get_child_blocks,
    .sy-puppy--action-document-get_child_docs .sy-puppy__tool-mark--document-get_child_docs,
    .sy-puppy--action-document-list_tree .sy-puppy__tool-mark--document-list_tree,
    .sy-puppy--action-document-set_icon .sy-puppy__tool-mark--document-set_icon,
    .sy-puppy--action-document-set_cover .sy-puppy__tool-mark--document-set_cover,
    .sy-puppy--action-document-clear_cover .sy-puppy__tool-mark--document-clear_cover,
    .sy-puppy--action-block-insert .sy-puppy__tool-mark--block-insert,
    .sy-puppy--action-block-prepend .sy-puppy__tool-mark--block-prepend,
    .sy-puppy--action-block-append .sy-puppy__tool-mark--block-append,
    .sy-puppy--action-block-update .sy-puppy__tool-mark--block-update,
    .sy-puppy--action-block-set_attrs .sy-puppy__tool-mark--block-set_attrs,
    .sy-puppy--action-block-delete .sy-puppy__tool-mark--block-delete,
    .sy-puppy--action-block-move .sy-puppy__tool-mark--block-move,
    .sy-puppy--action-block-transfer_ref .sy-puppy__tool-mark--block-transfer_ref,
    .sy-puppy--action-block-fold .sy-puppy__tool-mark--block-fold,
    .sy-puppy--action-block-unfold .sy-puppy__tool-mark--block-unfold,
    .sy-puppy--action-block-get_kramdown .sy-puppy__tool-mark--block-get_kramdown,
    .sy-puppy--action-block-dom .sy-puppy__tool-mark--block-dom,
    .sy-puppy--action-block-get_children .sy-puppy__tool-mark--block-get_children,
    .sy-puppy--action-block-breadcrumb .sy-puppy__tool-mark--block-breadcrumb,
    .sy-puppy--action-block-get_attrs .sy-puppy__tool-mark--block-get_attrs,
    .sy-puppy--action-block-info .sy-puppy__tool-mark--block-info,
    .sy-puppy--action-block-exists .sy-puppy__tool-mark--block-exists,
    .sy-puppy--action-block-word_count .sy-puppy__tool-mark--block-word_count,
    .sy-puppy--action-block-recent_updated .sy-puppy__tool-mark--block-recent_updated,
    .sy-puppy--action-av-get .sy-puppy__tool-mark--av-get,
    .sy-puppy--action-av-search .sy-puppy__tool-mark--av-search,
    .sy-puppy--action-av-get_primary_key_values .sy-puppy__tool-mark--av-get_primary_key_values,
    .sy-puppy--action-av-add_rows .sy-puppy__tool-mark--av-add_rows,
    .sy-puppy--action-av-remove_rows .sy-puppy__tool-mark--av-remove_rows,
    .sy-puppy--action-av-add_column .sy-puppy__tool-mark--av-add_column,
    .sy-puppy--action-av-remove_column .sy-puppy__tool-mark--av-remove_column,
    .sy-puppy--action-av-set_cell .sy-puppy__tool-mark--av-set_cell,
    .sy-puppy--action-av-batch_set_cells .sy-puppy__tool-mark--av-batch_set_cells,
    .sy-puppy--action-av-duplicate_block .sy-puppy__tool-mark--av-duplicate_block,
    .sy-puppy--action-file-upload_asset .sy-puppy__tool-mark--file-upload_asset,
    .sy-puppy--action-file-export_md .sy-puppy__tool-mark--file-export_md,
    .sy-puppy--action-file-export_resources .sy-puppy__tool-mark--file-export_resources,
    .sy-puppy--action-file-render_template .sy-puppy__tool-mark--file-render_template,
    .sy-puppy--action-file-render_sprig .sy-puppy__tool-mark--file-render_sprig,
    .sy-puppy--action-search-fulltext .sy-puppy__tool-mark--search-fulltext,
    .sy-puppy--action-search-query_sql .sy-puppy__tool-mark--search-query_sql,
    .sy-puppy--action-search-search_tag .sy-puppy__tool-mark--search-search_tag,
    .sy-puppy--action-search-get_backlinks .sy-puppy__tool-mark--search-get_backlinks,
    .sy-puppy--action-search-get_backmentions .sy-puppy__tool-mark--search-get_backmentions,
    .sy-puppy--action-tag-list .sy-puppy__tool-mark--tag-list,
    .sy-puppy--action-tag-rename .sy-puppy__tool-mark--tag-rename,
    .sy-puppy--action-tag-remove .sy-puppy__tool-mark--tag-remove,
    .sy-puppy--action-system-push_msg .sy-puppy__tool-mark--system-push_msg,
    .sy-puppy--action-system-push_err_msg .sy-puppy__tool-mark--system-push_err_msg,
    .sy-puppy--action-system-network .sy-puppy__tool-mark--system-network,
    .sy-puppy--action-system-conf .sy-puppy__tool-mark--system-conf,
    .sy-puppy--action-system-sys_fonts .sy-puppy__tool-mark--system-sys_fonts,
    .sy-puppy--action-system-workspace_info .sy-puppy__tool-mark--system-workspace_info,
    .sy-puppy--action-system-changelog .sy-puppy__tool-mark--system-changelog,
    .sy-puppy--action-system-boot_progress .sy-puppy__tool-mark--system-boot_progress,
    .sy-puppy--action-system-get_version .sy-puppy__tool-mark--system-get_version,
    .sy-puppy--action-system-get_current_time .sy-puppy__tool-mark--system-get_current_time {
        opacity: 1;
        animation: sy-puppy-tool-mark-pop 0.4s steps(2) infinite;
    }

    .sy-puppy--idle .sy-puppy__cat {
        animation: sy-puppy-ear-twitch 2.6s steps(1) infinite;
    }

    .sy-puppy--idle .sy-puppy__tail--1,
    .sy-puppy--idle .sy-puppy__tail--2,
    .sy-puppy--idle .sy-puppy__tail--3 {
        animation: sy-puppy-tail-sway 2.4s steps(3) infinite;
    }

    .sy-puppy--idle .sy-puppy__tail--2 {
        animation-delay: 0.16s;
    }

    .sy-puppy--idle .sy-puppy__tail--3 {
        animation-delay: 0.32s;
    }

    .sy-puppy--idle-stand .sy-puppy__cat {
        animation: sy-puppy-idle-stand 2.1s ease-in-out infinite, sy-puppy-ear-twitch 2.8s steps(1) infinite;
    }

    .sy-puppy--idle-look .sy-puppy__cat {
        animation: sy-puppy-idle-look 1.9s ease-in-out infinite, sy-puppy-ear-twitch 2.4s steps(1) infinite;
    }

    .sy-puppy--idle-look .sy-puppy__paw--left {
        animation: sy-puppy-paw-shift-left 1.9s ease-in-out infinite;
    }

    .sy-puppy--idle-sit .sy-puppy__cat {
        animation: sy-puppy-idle-sit 2.2s ease-in-out infinite;
    }

    .sy-puppy--idle-sit .sy-puppy__paw--left,
    .sy-puppy--idle-sit .sy-puppy__paw--right {
        animation: sy-puppy-paw-tuck 2.2s ease-in-out infinite;
    }

    .sy-puppy--idle-groom .sy-puppy__cat {
        animation: sy-puppy-idle-groom 1.5s steps(2) infinite;
    }

    .sy-puppy--idle-groom .sy-puppy__paw--left {
        animation: sy-puppy-groom-paw-left 1.5s steps(2) infinite;
    }

    .sy-puppy--idle-groom .sy-puppy__paw--right {
        animation: sy-puppy-groom-paw-right 1.5s steps(2) infinite;
    }

    .sy-puppy--idle-lie .sy-puppy__cat {
        animation: sy-puppy-idle-lie 2.8s ease-in-out infinite, sy-puppy-ear-twitch 4s steps(1) infinite;
    }

    .sy-puppy--idle-lie .sy-puppy__paw--left,
    .sy-puppy--idle-lie .sy-puppy__paw--right {
        animation: sy-puppy-paw-sprawl 2.8s ease-in-out infinite;
    }

    .sy-puppy--idle-lie .sy-puppy__tail--1,
    .sy-puppy--idle-lie .sy-puppy__tail--2,
    .sy-puppy--idle-lie .sy-puppy__tail--3 {
        animation-duration: 3.6s;
    }

    .sy-puppy--idle-sleep .sy-puppy__cat {
        animation: sy-puppy-idle-sleep 3.2s ease-in-out infinite;
    }

    .sy-puppy--idle-sleep .sy-puppy__paw--left,
    .sy-puppy--idle-sleep .sy-puppy__paw--right {
        animation: sy-puppy-paw-sleep 3.2s ease-in-out infinite;
    }

    .sy-puppy--idle-sleep .sy-puppy__tail--1,
    .sy-puppy--idle-sleep .sy-puppy__tail--2,
    .sy-puppy--idle-sleep .sy-puppy__tail--3 {
        animation: sy-puppy-tail-rest 4.2s ease-in-out infinite;
    }

    .sy-puppy.sy-puppy--pointer-down .sy-puppy__cat {
        animation: sy-puppy-pointer-down 0.18s ease-out forwards;
    }

    .sy-puppy.sy-puppy--pointer-down .sy-puppy__paw--left,
    .sy-puppy.sy-puppy--pointer-down .sy-puppy__paw--right {
        animation: sy-puppy-pointer-grab 0.18s ease-out forwards;
    }

    .sy-puppy.sy-puppy--pointer-drag .sy-puppy__cat {
        animation: sy-puppy-pointer-drag 0.52s steps(2) infinite;
    }

    .sy-puppy.sy-puppy--pointer-drag .sy-puppy__paw--left,
    .sy-puppy.sy-puppy--pointer-drag .sy-puppy__paw--right {
        animation: sy-puppy-pointer-grip 0.52s steps(2) infinite;
    }

    .sy-puppy.sy-puppy--pointer-drag .sy-puppy__tail--1,
    .sy-puppy.sy-puppy--pointer-drag .sy-puppy__tail--2,
    .sy-puppy.sy-puppy--pointer-drag .sy-puppy__tail--3 {
        animation: sy-puppy-tail-trail 0.52s steps(2) infinite;
    }

    .sy-puppy.sy-puppy--pointer-release .sy-puppy__cat {
        animation: sy-puppy-pointer-release 0.26s ease-out forwards;
    }

    .sy-puppy.sy-puppy--pointer-release .sy-puppy__paw--left,
    .sy-puppy.sy-puppy--pointer-release .sy-puppy__paw--right {
        animation: sy-puppy-pointer-release-paw 0.26s ease-out forwards;
    }

    .sy-puppy--reading .sy-puppy__cat {
        animation: sy-puppy-reading-body 1s ease-in-out infinite;
    }

    .sy-puppy--writing .sy-puppy__cat {
        animation: sy-puppy-writing-body 0.28s steps(2) infinite;
    }

    .sy-puppy--writing .sy-puppy__paw--left,
    .sy-puppy--writing .sy-puppy__paw--right {
        animation: sy-puppy-writing-paw 0.42s steps(2) infinite;
    }

    .sy-puppy--moving .sy-puppy__cat {
        animation: sy-puppy-moving-body 0.5s steps(2) infinite;
    }

    .sy-puppy--deleting .sy-puppy__cat {
        animation: sy-puppy-delete-body 0.18s steps(2) infinite;
    }

    .sy-puppy--dangerous .sy-puppy__cat {
        animation: sy-puppy-danger-body 0.15s steps(2) infinite;
    }

    .sy-puppy--error .sy-puppy__cat {
        animation: sy-puppy-error-shake 0.22s steps(2) infinite;
    }

    .sy-puppy--tool-notebook .sy-puppy__tool--notebook {
        animation: sy-puppy-notebook-idle 1.1s ease-in-out infinite;
    }

    .sy-puppy--tool-document .sy-puppy__tool--document {
        animation: sy-puppy-document-idle 1.1s ease-in-out infinite;
    }

    .sy-puppy--tool-block .sy-puppy__tool--block {
        animation: sy-puppy-block-idle 0.8s steps(2) infinite;
    }

    .sy-puppy--tool-av .sy-puppy__tool--av {
        animation: sy-puppy-av-idle 1.1s ease-in-out infinite;
    }

    .sy-puppy--tool-file .sy-puppy__tool--file {
        animation: sy-puppy-file-idle 1.2s ease-in-out infinite;
    }

    .sy-puppy--tool-search .sy-puppy__tool--search {
        animation: sy-puppy-search-idle 1.2s steps(4) infinite;
    }

    .sy-puppy--tool-tag .sy-puppy__tool--tag {
        animation: sy-puppy-tag-idle 1s ease-in-out infinite;
    }

    .sy-puppy--tool-system .sy-puppy__tool--system {
        animation: sy-puppy-system-idle 1s ease-in-out infinite;
    }

    .sy-puppy--tool-notebook .sy-puppy__cat,
    .sy-puppy--tool-document .sy-puppy__cat {
        transform-origin: 28px 54px;
    }

    .sy-puppy--tool-file .sy-puppy__cat,
    .sy-puppy--tool-tag .sy-puppy__cat,
    .sy-puppy--tool-system .sy-puppy__cat,
    .sy-puppy--tool-mascot .sy-puppy__cat {
        transform-origin: 68px 54px;
    }

    .sy-puppy--tool-block .sy-puppy__cat,
    .sy-puppy--tool-search .sy-puppy__cat,
    .sy-puppy--tool-av .sy-puppy__cat {
        transform-origin: 48px 34px;
    }

    .sy-puppy--reading.sy-puppy--tool-notebook .sy-puppy__paw--left,
    .sy-puppy--reading.sy-puppy--tool-document .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-notebook .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-document .sy-puppy__paw--left {
        animation: sy-puppy-paw-reach-left 0.46s steps(2) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-notebook .sy-puppy__paw--right,
    .sy-puppy--reading.sy-puppy--tool-document .sy-puppy__paw--right,
    .sy-puppy--writing.sy-puppy--tool-notebook .sy-puppy__paw--right,
    .sy-puppy--writing.sy-puppy--tool-document .sy-puppy__paw--right {
        animation: sy-puppy-paw-brace-right 0.46s steps(2) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-file .sy-puppy__paw--right,
    .sy-puppy--reading.sy-puppy--tool-tag .sy-puppy__paw--right,
    .sy-puppy--reading.sy-puppy--tool-system .sy-puppy__paw--right,
    .sy-puppy--reading.sy-puppy--tool-mascot .sy-puppy__paw--right,
    .sy-puppy--writing.sy-puppy--tool-file .sy-puppy__paw--right,
    .sy-puppy--writing.sy-puppy--tool-tag .sy-puppy__paw--right,
    .sy-puppy--writing.sy-puppy--tool-system .sy-puppy__paw--right,
    .sy-puppy--writing.sy-puppy--tool-mascot .sy-puppy__paw--right {
        animation: sy-puppy-paw-reach-right 0.46s steps(2) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-file .sy-puppy__paw--left,
    .sy-puppy--reading.sy-puppy--tool-tag .sy-puppy__paw--left,
    .sy-puppy--reading.sy-puppy--tool-system .sy-puppy__paw--left,
    .sy-puppy--reading.sy-puppy--tool-mascot .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-file .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-tag .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-system .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-mascot .sy-puppy__paw--left {
        animation: sy-puppy-paw-brace-left 0.46s steps(2) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-block .sy-puppy__paw--left,
    .sy-puppy--reading.sy-puppy--tool-search .sy-puppy__paw--left,
    .sy-puppy--reading.sy-puppy--tool-av .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-block .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-av .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-search .sy-puppy__paw--left,
    .sy-puppy--writing.sy-puppy--tool-search .sy-puppy__paw--left {
        animation: sy-puppy-paw-reach-up-left 0.4s steps(2) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-block .sy-puppy__paw--right,
    .sy-puppy--reading.sy-puppy--tool-search .sy-puppy__paw--right,
    .sy-puppy--reading.sy-puppy--tool-av .sy-puppy__paw--right,
    .sy-puppy--writing.sy-puppy--tool-block .sy-puppy__paw--right,
    .sy-puppy--writing.sy-puppy--tool-av .sy-puppy__paw--right,
    .sy-puppy--writing.sy-puppy--tool-search .sy-puppy__paw--right {
        animation: sy-puppy-paw-reach-up-right 0.4s steps(2) infinite 0.08s;
    }

    .sy-puppy--reading.sy-puppy--tool-notebook .sy-puppy__cat {
        animation: sy-puppy-read-left-book 1s steps(2) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-document .sy-puppy__cat {
        animation: sy-puppy-read-left-sheet 1s steps(2) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-search .sy-puppy__cat {
        animation: sy-puppy-track-search 1s steps(3) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-av .sy-puppy__cat {
        animation: sy-puppy-track-search 1s steps(3) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-system .sy-puppy__cat {
        animation: sy-puppy-monitor-right 1s steps(2) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-mascot .sy-puppy__cat {
        animation: sy-puppy-monitor-right 1s steps(2) infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-notebook .sy-puppy__tool--notebook,
    .sy-puppy--reading.sy-puppy--tool-document .sy-puppy__tool--document,
    .sy-puppy--reading.sy-puppy--tool-tag .sy-puppy__tool--tag {
        animation-duration: 0.9s;
    }

    .sy-puppy--reading.sy-puppy--tool-search .sy-puppy__tool--search {
        animation: sy-puppy-search-scan 1s ease-in-out infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-av .sy-puppy__tool--av {
        animation: sy-puppy-search-scan 1s ease-in-out infinite;
    }

    .sy-puppy--reading.sy-puppy--tool-system .sy-puppy__tool--system {
        animation: sy-puppy-system-pulse 0.95s ease-in-out infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-block .sy-puppy__tool--block {
        animation: sy-puppy-block-build 0.42s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-av .sy-puppy__tool--av {
        animation: sy-puppy-block-build 0.42s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-block .sy-puppy__cat {
        animation: sy-puppy-build-reach 0.42s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-av .sy-puppy__cat {
        animation: sy-puppy-build-reach 0.42s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-file .sy-puppy__tool--file {
        animation: sy-puppy-file-shuffle 0.42s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-file .sy-puppy__cat {
        animation: sy-puppy-push-right 0.42s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-search .sy-puppy__tool--search,
    .sy-puppy--writing.sy-puppy--tool-system .sy-puppy__tool--system {
        animation: sy-puppy-tool-tap 0.4s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-search .sy-puppy__cat,
    .sy-puppy--writing.sy-puppy--tool-system .sy-puppy__cat {
        animation: sy-puppy-tap-up 0.4s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-notebook .sy-puppy__tool--notebook,
    .sy-puppy--writing.sy-puppy--tool-document .sy-puppy__tool--document,
    .sy-puppy--writing.sy-puppy--tool-tag .sy-puppy__tool--tag {
        animation: sy-puppy-tool-lean 0.4s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-notebook .sy-puppy__cat,
    .sy-puppy--writing.sy-puppy--tool-document .sy-puppy__cat {
        animation: sy-puppy-write-left 0.4s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-tag .sy-puppy__cat {
        animation: sy-puppy-stamp-right 0.4s steps(2) infinite;
    }

    .sy-puppy--writing.sy-puppy--tool-mascot .sy-puppy__cat {
        animation: sy-puppy-push-right 0.42s steps(2) infinite;
    }

    .sy-puppy--moving .sy-puppy__tool {
        animation-name: sy-puppy-move-prop;
        animation-duration: 0.5s;
        animation-timing-function: steps(2);
        animation-iteration-count: infinite;
    }

    .sy-puppy--deleting .sy-puppy__overlay--delete {
        animation: sy-puppy-delete-x 0.4s steps(2) infinite;
    }

    .sy-puppy--dangerous .sy-puppy__overlay--danger {
        animation: sy-puppy-danger-exclaim 0.5s steps(2) infinite;
    }

    .sy-puppy__sweat {
        animation: sy-puppy-sweat-drop 0.6s steps(2) infinite;
    }

    @keyframes sy-puppy-bubble-in {
        from { opacity: 0; transform: translateX(-50%) translateY(4px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    @keyframes sy-puppy-bubble-in-left {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
    }

    @keyframes sy-puppy-bubble-in-down {
        from { opacity: 0; transform: translateY(-4px); }
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

    @keyframes sy-puppy-wage-card-show {
        0% { transform: translate(4px, 8px) rotate(14deg) scale(0.7); }
        60% { transform: translate(-1px, -2px) rotate(-8deg) scale(1.06); }
        100% { transform: translate(0, 0) rotate(0deg) scale(1); }
    }

    @keyframes sy-puppy-bob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-6px); }
    }

    @keyframes sy-puppy-idle-stand {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-2px) rotate(-1deg); }
    }

    @keyframes sy-puppy-idle-look {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        30% { transform: translateX(-2px) rotate(-4deg); }
        70% { transform: translateX(1px) rotate(3deg); }
    }

    @keyframes sy-puppy-idle-sit {
        0%, 100% { transform: translateY(0) scaleY(1); }
        50% { transform: translateY(3px) scaleY(0.95); }
    }

    @keyframes sy-puppy-idle-groom {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        50% { transform: translateX(-4px) translateY(1px) rotate(-7deg); }
    }

    @keyframes sy-puppy-idle-lie {
        0%, 100% { transform: translateY(3px) scaleY(0.9) scaleX(1.03); }
        50% { transform: translateY(4px) scaleY(0.88) scaleX(1.05); }
    }

    @keyframes sy-puppy-idle-sleep {
        0%, 100% { transform: translateY(5px) scaleY(0.85) scaleX(1.08); }
        50% { transform: translateY(6px) scaleY(0.82) scaleX(1.1); }
    }

    @keyframes sy-puppy-idle-paw {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(2px); }
    }

    @keyframes sy-puppy-paw-sprawl {
        0%, 100% { transform: translateY(3px) scaleY(0.82) scaleX(1.08); }
        50% { transform: translateY(4px) scaleY(0.78) scaleX(1.12); }
    }

    @keyframes sy-puppy-paw-sleep {
        0%, 100% { transform: translateY(5px) scaleY(0.72) scaleX(1.14); }
        50% { transform: translateY(6px) scaleY(0.68) scaleX(1.18); }
    }

    @keyframes sy-puppy-paw-shift-left {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(-1px, 1px) rotate(-6deg); }
    }

    @keyframes sy-puppy-paw-tuck {
        0%, 100% { transform: translateY(0) scaleY(1); }
        50% { transform: translateY(2px) scaleY(0.92); }
    }

    @keyframes sy-puppy-groom-paw-left {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(8px, -12px) rotate(-22deg); }
    }

    @keyframes sy-puppy-groom-paw-right {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(-1px, 2px) rotate(4deg); }
    }

    @keyframes sy-puppy-tail-rest {
        0%, 100% { transform: rotate(0deg) translateY(0); }
        50% { transform: rotate(3deg) translateY(1px); }
    }

    @keyframes sy-puppy-sleep-z {
        0% {
            transform: translate(0, 0) scale(0.85);
            opacity: 0;
        }
        18% {
            opacity: 1;
        }
        100% {
            transform: translate(5px, -12px) scale(1.08);
            opacity: 0;
        }
    }

    @keyframes sy-puppy-tail-wag {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        33% { transform: translateY(-3px) rotate(-8deg); }
        66% { transform: translateY(-3px) rotate(8deg); }
    }

    @keyframes sy-puppy-tail-sway {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-1px) rotate(6deg); }
    }

    @keyframes sy-puppy-tail-trail {
        0%, 100% { transform: translateY(0) rotate(-4deg); }
        50% { transform: translateY(-3px) rotate(10deg); }
    }

    @keyframes sy-puppy-ear-twitch {
        0%, 100% { transform: scaleY(1); }
        50% { transform: scaleY(0.95); }
    }

    @keyframes sy-puppy-pointer-down {
        from { transform: translateY(0) scale(1); }
        to { transform: translateY(3px) scale(1.03, 0.95); }
    }

    @keyframes sy-puppy-pointer-grab {
        from { transform: translateY(0) rotate(0deg); }
        to { transform: translateY(2px) rotate(6deg); }
    }

    @keyframes sy-puppy-pointer-drag {
        0%, 100% { transform: translate(0, 2px) rotate(-4deg); }
        50% { transform: translate(2px, -1px) rotate(4deg); }
    }

    @keyframes sy-puppy-pointer-grip {
        0%, 100% { transform: translateY(0) rotate(6deg); }
        50% { transform: translateY(1px) rotate(-4deg); }
    }

    @keyframes sy-puppy-pointer-release {
        0% { transform: translateY(2px) scale(1.02, 0.97); }
        70% { transform: translateY(-3px) scale(0.99, 1.02); }
        100% { transform: translateY(0) scale(1); }
    }

    @keyframes sy-puppy-pointer-release-paw {
        0% { transform: translateY(2px) rotate(8deg); }
        100% { transform: translateY(0) rotate(0deg); }
    }

    @keyframes sy-puppy-reading-body {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(-4deg) translateY(-1px); }
    }

    @keyframes sy-puppy-read-left-book {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        50% { transform: translateX(-5px) rotate(-10deg); }
    }

    @keyframes sy-puppy-read-left-sheet {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        50% { transform: translateX(-6px) rotate(-8deg) translateY(-2px); }
    }

    @keyframes sy-puppy-track-search {
        0%, 100% { transform: rotate(-3deg) translateY(0); }
        25% { transform: rotate(-11deg) translateY(-1px); }
        75% { transform: rotate(8deg) translateY(-1px); }
    }

    @keyframes sy-puppy-monitor-right {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(8deg) translateX(3px); }
    }

    @keyframes sy-puppy-writing-body {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(3deg) translateY(-2px); }
    }

    @keyframes sy-puppy-build-reach {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px) rotate(-2deg); }
    }

    @keyframes sy-puppy-push-right {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        50% { transform: translateX(4px) rotate(3deg); }
    }

    @keyframes sy-puppy-tap-up {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px) rotate(2deg); }
    }

    @keyframes sy-puppy-write-left {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        50% { transform: translateX(-3px) rotate(-5deg); }
    }

    @keyframes sy-puppy-stamp-right {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        50% { transform: translateX(4px) rotate(4deg); }
    }

    @keyframes sy-puppy-writing-paw {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
    }

    @keyframes sy-puppy-paw-reach-left {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(-4px, -1px) rotate(-12deg); }
    }

    @keyframes sy-puppy-paw-reach-right {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(4px, -1px) rotate(12deg); }
    }

    @keyframes sy-puppy-paw-brace-left {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(-1px, 1px) rotate(-3deg); }
    }

    @keyframes sy-puppy-paw-brace-right {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(1px, 1px) rotate(3deg); }
    }

    @keyframes sy-puppy-paw-reach-up-left {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translate(-1px, -6px) rotate(-4deg); }
    }

    @keyframes sy-puppy-paw-reach-up-right {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translate(1px, -6px) rotate(4deg); }
    }

    @keyframes sy-puppy-moving-body {
        0%, 100% { transform: translateX(-4px) rotate(-4deg); }
        50% { transform: translateX(4px) rotate(4deg); }
    }

    @keyframes sy-puppy-delete-body {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(2px); }
    }

    @keyframes sy-puppy-danger-body {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(-2px); }
    }

    @keyframes sy-puppy-error-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
    }

    @keyframes sy-puppy-notebook-idle {
        0%, 100% { transform: translateY(0) rotate(-2deg); }
        50% { transform: translateY(-3px) rotate(2deg); }
    }

    @keyframes sy-puppy-document-idle {
        0%, 100% { transform: translateY(0) rotate(-4deg); }
        50% { transform: translateY(-4px) rotate(-8deg); }
    }

    @keyframes sy-puppy-block-idle {
        0%, 100% { transform: translateY(-6px); }
        50% { transform: translateY(0); }
    }

    @keyframes sy-puppy-av-idle {
        0%, 100% { transform: translate(0, 0) scale(1); }
        50% { transform: translate(-1px, -1px) scale(1.02); }
    }

    @keyframes sy-puppy-file-idle {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(6px); }
    }

    @keyframes sy-puppy-search-idle {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-14px); }
        50% { transform: translateX(0); }
        75% { transform: translateX(14px); }
    }

    @keyframes sy-puppy-tag-idle {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(10deg) translateY(-1px); }
    }

    @keyframes sy-puppy-system-idle {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(5deg) translateY(-2px); }
    }

    @keyframes sy-puppy-block-build {
        0%, 100% { transform: translateY(-10px); }
        50% { transform: translateY(2px); }
    }

    @keyframes sy-puppy-file-shuffle {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(10px); }
    }

    @keyframes sy-puppy-tool-tap {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
    }

    @keyframes sy-puppy-tool-lean {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(-10deg) translateY(-3px); }
    }

    @keyframes sy-puppy-move-prop {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(10px); }
    }

    @keyframes sy-puppy-search-scan {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-16px) translateY(2px); }
        80% { transform: translateX(16px) translateY(-2px); }
    }

    @keyframes sy-puppy-system-pulse {
        0%, 100% { transform: scale(1) rotate(0deg); }
        50% { transform: scale(1.08) rotate(4deg); }
    }

    @keyframes sy-puppy-tool-mark-pop {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-1px) scale(1.06); }
    }

    @keyframes sy-puppy-delete-x {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
    }

    @keyframes sy-puppy-danger-exclaim {
        0%, 100% { transform: scale(1); fill: #ffd040; }
        50% { transform: scale(1.35); fill: #ff4d6d; }
    }

    @keyframes sy-puppy-sweat-drop {
        0%, 100% { transform: translateY(0); opacity: 1; }
        50% { transform: translateY(6px); opacity: 0.5; }
    }
</style>
