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
    <section class="feedback-panel" aria-label={getLabel("feedback_panel_title", "Feedback")}>
        <label class="feedback-panel__field">
            <span>{getLabel("feedback_description_label", "Problem or Experience")}</span>
            <textarea
                class="b3-text-field feedback-panel__textarea"
                bind:value={description}
                maxlength="4000"
                placeholder={getLabel("feedback_description_placeholder", "Describe the issue, suggestion, or experience you want to share.")}
            />
        </label>

        <label class="feedback-panel__field">
            <span>{getLabel("feedback_impact_label", "Impact")}</span>
            <textarea
                class="b3-text-field feedback-panel__textarea feedback-panel__textarea--short"
                bind:value={impact}
                maxlength="1000"
                placeholder={getLabel("feedback_impact_placeholder", "Optional: affected workflow, inconvenience, or error context.")}
            />
        </label>

        <label class="feedback-panel__field">
            <span>{getLabel("feedback_suggestion_label", "Suggestion")}</span>
            <textarea
                class="b3-text-field feedback-panel__textarea feedback-panel__textarea--short"
                bind:value={suggestion}
                maxlength="1000"
                placeholder={getLabel("feedback_suggestion_placeholder", "Optional: how you hope it can be improved.")}
            />
        </label>

        <div class="feedback-panel__actions">
            <button class="b3-button b3-button--text" type="button" disabled={!canSubmit} on:click={submit}>
                {submitting ? getLabel("feedback_submitting", "Submitting...") : getLabel("feedback_submit_button", "Submit Feedback")}
            </button>
            {#if statusText}
                <span class:feedback-panel__status--success={statusType === "success"} class:feedback-panel__status--error={statusType === "error"} class="feedback-panel__status">
                    {statusText}
                </span>
            {/if}
        </div>
    </section>
</SettingPanel>

<style>
    .feedback-panel {
        background: var(--mcp-config-surface, var(--b3-theme-surface));
        border: 1px solid var(--mcp-config-border, var(--b3-border-color));
        border-radius: var(--mcp-config-card-radius, 10px);
        box-shadow: var(--mcp-config-shadow, none);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: var(--mcp-config-section-gap, 12px);
        max-width: 760px;
        padding: var(--mcp-config-card-padding, 16px 18px);
    }

    .feedback-panel__field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--b3-theme-on-background);
        font-size: 13px;
    }

    .feedback-panel__textarea {
        box-sizing: border-box;
        min-height: 132px;
        padding: 10px 12px;
        resize: vertical;
        line-height: 1.55;
    }

    .feedback-panel__textarea--short {
        min-height: 84px;
    }

    .feedback-panel__actions {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 32px;
    }

    .feedback-panel__status {
        color: var(--mcp-config-caption-color, var(--b3-theme-on-surface-light));
        font-size: 12px;
        line-height: 1.45;
    }

    .feedback-panel__status--success {
        color: var(--b3-theme-success, #2e7d32);
    }

    .feedback-panel__status--error {
        color: var(--b3-theme-error, #d32f2f);
    }

    @media (max-width: 768px) {
        .feedback-panel {
            max-width: none;
        }
    }
</style>
