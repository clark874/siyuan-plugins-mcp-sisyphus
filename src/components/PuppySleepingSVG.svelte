{#if isSleeping}
<div class="sy-puppy__sleep-zzz" aria-hidden="true">
    <span class="sy-puppy__sleep-z sy-puppy__sleep-z--1">z</span>
    <span class="sy-puppy__sleep-z sy-puppy__sleep-z--2">Z</span>
    <span class="sy-puppy__sleep-z sy-puppy__sleep-z--3">Z</span>
</div>
{/if}

<script lang="ts">
    export let isSleeping = false;
</script>

<style>
    :global(.sy-puppy__sleep-zzz) {
        position: absolute;
        right: -2px;
        top: -22px;
        width: 34px;
        height: 28px;
        pointer-events: none;
        z-index: 4;
    }

    :global(.sy-puppy__sleep-z) {
        position: absolute;
        display: block;
        color: #5f74b8;
        font-weight: 700;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        text-shadow: 0 1px 0 #fff;
        animation: sy-puppy-sleep-z 1.6s ease-in-out infinite;
        opacity: 0;
    }

    :global(.sy-puppy__sleep-z--1) {
        left: 2px;
        bottom: 0;
        font-size: 11px;
    }

    :global(.sy-puppy__sleep-z--2) {
        left: 13px;
        bottom: 9px;
        font-size: 14px;
        animation-delay: 0.28s;
    }

    :global(.sy-puppy__sleep-z--3) {
        left: 23px;
        bottom: 17px;
        font-size: 16px;
        animation-delay: 0.56s;
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
</style>
