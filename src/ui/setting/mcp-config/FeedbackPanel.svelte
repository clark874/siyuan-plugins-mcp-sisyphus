<script lang="ts">
    import SettingPanel from "../../shared/setting-panel.svelte";

    export let group: string;
    export let display = false;
    export let plugin: any;
    export let getLabel: (key: string, fallback: string) => string;

    let description = "";
    let impact = "";
    let suggestion = "";
    let submitting = false;
    let statusText = "";
    let statusType: "idle" | "success" | "error" = "idle";

    $: canSubmit = description.trim().length > 0 && !submitting;

    async function submit() {
        if (!canSubmit) return;
        submitting = true;
        statusType = "idle";
        statusText = "";
        try {
            const result = await plugin?.submitFeedback?.({
                description,
                impact,
                suggestion,
                source: "settings",
            });
            statusType = "success";
            statusText = result?.aid
                ? getLabel("feedback_submit_success_with_id", "Feedback submitted. ID: {id}").replace("{id}", result.aid)
                : getLabel("feedback_submit_success", "Feedback submitted.");
            description = "";
            impact = "";
            suggestion = "";
        } catch (err) {
            statusType = "error";
            statusText = err instanceof Error ? err.message : String(err);
        } finally {
            submitting = false;
        }
    }
</script>

<SettingPanel {group} settingItems={[]} {display}>
    <section class="feedback-panel" aria-labelledby="feedback-panel-title">
        <div class="feedback-panel__notice">
            <span class="feedback-panel__notice-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                    <path d="M12 2.75 4.5 5.9v5.35c0 4.7 3.1 8.9 7.5 10 4.4-1.1 7.5-5.3 7.5-10V5.9L12 2.75Zm0 2.15 5.5 2.3v4.05c0 3.55-2.22 6.8-5.5 7.85-3.28-1.05-5.5-4.3-5.5-7.85V7.2L12 4.9Z"/>
                    <path d="M11 8h2v5h-2V8Zm0 6.5h2v2h-2v-2Z"/>
                </svg>
            </span>
            <div>
                <h3 id="feedback-panel-title">{getLabel("feedback_panel_title", "Feedback")}</h3>
                <p>{getLabel("feedback_panel_desc", "Send plain-text feedback to the developer. Do not include secrets, tokens, or private note content.")}</p>
            </div>
        </div>

        <form class="feedback-panel__form" on:submit|preventDefault={submit}>
            <div class="feedback-panel__field feedback-panel__field--primary">
                <div class="feedback-panel__label-row">
                    <label for="feedback-description">{getLabel("feedback_description_label", "Problem or Experience")}</label>
                    <span class="feedback-panel__badge feedback-panel__badge--required">
                        {getLabel("feedback_required_badge", "Required")}
                    </span>
                </div>
                <textarea
                    id="feedback-description"
                    class="b3-text-field feedback-panel__textarea"
                    bind:value={description}
                    maxlength="4000"
                    rows="7"
                    spellcheck="true"
                    placeholder={getLabel("feedback_description_placeholder", "Describe the issue, suggestion, or experience you want to share.")}
                />
                <div class="feedback-panel__field-footer">
                    <span>{getLabel("feedback_description_hint", "Include what happened, what you expected, and how to reproduce it when relevant.")}</span>
                    <span class="feedback-panel__count">{description.length}/4000</span>
                </div>
            </div>

            <div class="feedback-panel__secondary-grid">
                <div class="feedback-panel__field">
                    <div class="feedback-panel__label-row">
                        <label for="feedback-impact">{getLabel("feedback_impact_label", "Impact")}</label>
                        <span class="feedback-panel__badge">{getLabel("feedback_optional_badge", "Optional")}</span>
                    </div>
                    <textarea
                        id="feedback-impact"
                        class="b3-text-field feedback-panel__textarea feedback-panel__textarea--short"
                        bind:value={impact}
                        maxlength="1000"
                        rows="4"
                        spellcheck="true"
                        placeholder={getLabel("feedback_impact_placeholder", "Optional: affected workflow, inconvenience, or error context.")}
                    />
                    <span class="feedback-panel__count">{impact.length}/1000</span>
                </div>

                <div class="feedback-panel__field">
                    <div class="feedback-panel__label-row">
                        <label for="feedback-suggestion">{getLabel("feedback_suggestion_label", "Suggestion")}</label>
                        <span class="feedback-panel__badge">{getLabel("feedback_optional_badge", "Optional")}</span>
                    </div>
                    <textarea
                        id="feedback-suggestion"
                        class="b3-text-field feedback-panel__textarea feedback-panel__textarea--short"
                        bind:value={suggestion}
                        maxlength="1000"
                        rows="4"
                        spellcheck="true"
                        placeholder={getLabel("feedback_suggestion_placeholder", "Optional: how you hope it can be improved.")}
                    />
                    <span class="feedback-panel__count">{suggestion.length}/1000</span>
                </div>
            </div>

            <div class="feedback-panel__actions">
                <div
                    class:feedback-panel__status--success={statusType === "success"}
                    class:feedback-panel__status--error={statusType === "error"}
                    class="feedback-panel__status"
                    role="status"
                    aria-live="polite"
                >
                    {statusText}
                </div>
                <button class="b3-button feedback-panel__submit" type="submit" disabled={!canSubmit}>
                    {#if submitting}
                        <span class="feedback-panel__spinner" aria-hidden="true"></span>
                    {:else}
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m3.4 4.05 17.45 7.1a.92.92 0 0 1 0 1.7L3.4 19.95a.9.9 0 0 1-1.2-1.02l1.12-5.14L13.5 12 3.32 10.21 2.2 5.07a.9.9 0 0 1 1.2-1.02Z"/>
                        </svg>
                    {/if}
                    <span>{submitting ? getLabel("feedback_submitting", "Submitting...") : getLabel("feedback_submit_button", "Submit Feedback")}</span>
                </button>
            </div>
        </form>
    </section>
</SettingPanel>

<style>
    .feedback-panel {
        background: var(--mcp-config-surface-raised, var(--b3-theme-surface));
        border: 1px solid var(--mcp-config-border, var(--b3-border-color));
        border-radius: var(--mcp-config-card-radius, 10px);
        box-shadow: var(--mcp-config-shadow, none);
        box-sizing: border-box;
        max-width: 840px;
        overflow: hidden;
        width: 100%;
    }

    .feedback-panel__notice {
        align-items: flex-start;
        background:
            linear-gradient(135deg, color-mix(in srgb, var(--b3-theme-primary) 10%, transparent), transparent 68%),
            var(--mcp-config-surface, var(--b3-theme-surface));
        border-bottom: 1px solid var(--mcp-config-border, var(--b3-border-color));
        display: flex;
        gap: 12px;
        padding: 16px 18px;
    }

    .feedback-panel__notice-icon {
        align-items: center;
        background: var(--mcp-config-primary-soft, color-mix(in srgb, var(--b3-theme-primary) 12%, transparent));
        border: 1px solid var(--mcp-config-primary-border, color-mix(in srgb, var(--b3-theme-primary) 26%, transparent));
        border-radius: var(--mcp-config-icon-radius, 9px);
        color: var(--b3-theme-primary);
        display: inline-flex;
        flex: 0 0 34px;
        height: 34px;
        justify-content: center;
        width: 34px;
    }

    .feedback-panel__notice-icon svg {
        fill: currentColor;
        height: 18px;
        width: 18px;
    }

    .feedback-panel__notice h3 {
        color: var(--mcp-config-title-color, var(--b3-theme-on-background));
        font-size: 14px;
        font-weight: 650;
        line-height: 1.45;
        margin: 0;
    }

    .feedback-panel__notice p {
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        font-size: 12px;
        line-height: 1.55;
        margin: 3px 0 0;
        max-width: 680px;
    }

    .feedback-panel__form {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 20px 22px 22px;
    }

    .feedback-panel__field {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
        color: var(--b3-theme-on-background);
        font-size: 13px;
    }

    .feedback-panel__label-row {
        align-items: center;
        display: flex;
        gap: 8px;
        justify-content: space-between;
    }

    .feedback-panel__label-row label {
        color: var(--mcp-config-title-color, var(--b3-theme-on-background));
        font-size: 13px;
        font-weight: 600;
        line-height: 1.45;
    }

    .feedback-panel__badge {
        background: color-mix(in srgb, var(--b3-theme-on-surface) 5%, transparent);
        border: 1px solid var(--mcp-config-border, var(--b3-border-color));
        border-radius: 999px;
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        font-size: 10px;
        font-weight: 550;
        line-height: 1.4;
        padding: 2px 7px;
    }

    .feedback-panel__badge--required {
        background: var(--mcp-config-primary-soft, color-mix(in srgb, var(--b3-theme-primary) 12%, transparent));
        border-color: var(--mcp-config-primary-border, color-mix(in srgb, var(--b3-theme-primary) 26%, transparent));
        color: var(--b3-theme-primary);
    }

    .feedback-panel__textarea {
        background: var(--b3-theme-background);
        border: 1px solid var(--mcp-config-border, var(--b3-border-color));
        border-radius: var(--mcp-config-control-radius, 8px);
        box-sizing: border-box;
        box-shadow: inset 0 1px 1px color-mix(in srgb, var(--b3-theme-on-background) 3%, transparent);
        color: var(--b3-theme-on-background);
        line-height: 1.6;
        min-height: 154px;
        padding: 12px 14px;
        resize: vertical;
        transition: border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
        width: 100%;
    }

    .feedback-panel__textarea:hover {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 24%, var(--b3-border-color));
    }

    .feedback-panel__textarea:focus {
        background: var(--b3-theme-surface);
        border-color: color-mix(in srgb, var(--b3-theme-primary) 72%, var(--b3-border-color));
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--b3-theme-primary) 13%, transparent);
        outline: none;
    }

    .feedback-panel__textarea::placeholder {
        color: color-mix(in srgb, var(--mcp-config-caption-color, var(--b3-theme-on-surface-light)) 78%, transparent);
    }

    .feedback-panel__textarea--short {
        min-height: 112px;
    }

    .feedback-panel__secondary-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .feedback-panel__field-footer {
        align-items: flex-start;
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        display: flex;
        font-size: 11px;
        gap: 16px;
        justify-content: space-between;
        line-height: 1.5;
    }

    .feedback-panel__field-footer > :first-child {
        max-width: 620px;
    }

    .feedback-panel__count {
        align-self: flex-end;
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        font-family: var(--mcp-config-code-font, monospace);
        font-size: 10px;
        line-height: 1.4;
        white-space: nowrap;
    }

    .feedback-panel__actions {
        align-items: center;
        border-top: 1px solid var(--mcp-config-border, var(--b3-border-color));
        display: flex;
        gap: 16px;
        justify-content: space-between;
        margin-top: 2px;
        min-height: 40px;
        padding-top: 18px;
    }

    .feedback-panel__submit {
        align-items: center;
        background: var(--b3-theme-primary);
        border: 1px solid var(--b3-theme-primary);
        border-radius: var(--mcp-config-control-radius, 8px);
        box-shadow: 0 2px 5px color-mix(in srgb, var(--b3-theme-primary) 22%, transparent);
        color: var(--b3-theme-on-primary, #fff);
        display: inline-flex;
        flex: 0 0 auto;
        font-weight: 600;
        gap: 8px;
        justify-content: center;
        min-height: 36px;
        min-width: 126px;
        padding: 8px 15px;
        transition: filter 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
    }

    .feedback-panel__submit:not(:disabled):hover {
        box-shadow: 0 4px 10px color-mix(in srgb, var(--b3-theme-primary) 28%, transparent);
        filter: brightness(1.04);
        transform: translateY(-1px);
    }

    .feedback-panel__submit:not(:disabled):active {
        box-shadow: 0 1px 3px color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
        transform: translateY(0);
    }

    .feedback-panel__submit:disabled {
        box-shadow: none;
        cursor: not-allowed;
        opacity: 0.42;
    }

    .feedback-panel__submit:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 48%, transparent);
        outline-offset: 2px;
    }

    .feedback-panel__submit svg {
        fill: currentColor;
        height: 16px;
        width: 16px;
    }

    .feedback-panel__spinner {
        animation: feedback-spin 0.75s linear infinite;
        border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
        border-radius: 50%;
        border-top-color: currentColor;
        box-sizing: border-box;
        height: 15px;
        width: 15px;
    }

    .feedback-panel__status {
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        flex: 1 1 auto;
        font-size: 12px;
        line-height: 1.45;
        min-width: 0;
    }

    .feedback-panel__status--success {
        color: var(--b3-theme-success, #2e7d32);
    }

    .feedback-panel__status--error {
        color: var(--b3-theme-error, #d32f2f);
    }

    @keyframes feedback-spin {
        to {
            transform: rotate(360deg);
        }
    }

    @media (max-width: 768px) {
        .feedback-panel {
            max-width: none;
        }

        .feedback-panel__form {
            gap: 16px;
            padding: 16px;
        }

        .feedback-panel__notice {
            padding: 14px 16px;
        }

        .feedback-panel__secondary-grid {
            grid-template-columns: 1fr;
        }

        .feedback-panel__actions {
            align-items: stretch;
            flex-direction: column-reverse;
        }

        .feedback-panel__submit {
            width: 100%;
        }
    }
</style>
