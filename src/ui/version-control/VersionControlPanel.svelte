<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fetchPost, showMessage } from "siyuan";
    import {
        buildChangedFiles,
        diffSnapshotBlocks,
        getDocumentIdFromSnapshotFile,
        getRestoreParentCandidates,
        getSnapshotFileId,
        type BlockDiffEntry,
        type ChangedSnapshotFile,
        type RepoSnapshotFileChange,
    } from "./block-diff";
    import { cleanupTempSnapshot, createTempSnapshotTag, tagTempSnapshot } from "./temp-snapshot";

    type Snapshot = {
        id: string;
        memo?: string;
        tag?: string;
        created?: string;
        updated?: string;
        hCreated?: string;
        [key: string]: unknown;
    };

    type SnapshotFileContent = {
        title?: string;
        content?: string;
        displayInText?: boolean;
        updated?: string | number;
    };

    const TEMP_SNAPSHOT_PREFIX = "[Sisyphus Temp Diff]";

    let snapshots: Snapshot[] = [];
    let visibleSnapshots: Snapshot[] = [];
    let tagSnapshots: Snapshot[] = [];
    let leftSnapshot = "";
    let rightSnapshot = "";
    let memo = "";
    let loadingSnapshots = false;
    let loadingDiff = false;
    let loadingFile = false;
    let applying = false;
    let files: ChangedSnapshotFile[] = [];
    let selectedFileKey = "";
    let oldContent = "";
    let newContent = "";
    let oldFileContent: SnapshotFileContent | null = null;
    let newFileContent: SnapshotFileContent | null = null;
    let entries: BlockDiffEntry[] = [];
    let error = "";
    let page = 1;
    let pageCount = 1;
    let showTempSnapshots = false;
    let tempSnapshotId = "";
    let tempSnapshotMemo = "";
    let tempSnapshotTag = "";
    let cleanupStarted = false;
    let autoDiffReady = false;

    $: selectedFile = files.find((file) => file.key === selectedFileKey);
    $: canCompare = Boolean(leftSnapshot && rightSnapshot && leftSnapshot !== rightSnapshot);
    $: selectedOldFileId = getSnapshotFileId(selectedFile?.oldFile);
    $: selectedNewFileId = getSnapshotFileId(selectedFile?.newFile);
    $: visibleSnapshots = snapshots.filter((snapshot) => showTempSnapshots || !isTempSnapshot(snapshot) || snapshot.id === leftSnapshot || snapshot.id === rightSnapshot);

    onMount(async () => {
        await initializeWorkspaceDiff();
    });

    onDestroy(() => {
        void cleanupTempSnapshotOnClose();
        tempSnapshotId = "";
        tempSnapshotMemo = "";
        tempSnapshotTag = "";
    });

    function post<T>(endpoint: string, data: Record<string, unknown> = {}): Promise<T> {
        return new Promise((resolve, reject) => {
            fetchPost(endpoint, data, (response: { code: number; msg?: string; data: T }) => {
                if (response?.code === 0) {
                    resolve(response.data);
                } else {
                    reject(new Error(response?.msg || `SiYuan API error from ${endpoint}`));
                }
            });
        });
    }

    async function initializeWorkspaceDiff() {
        loadingSnapshots = true;
        error = "";
        try {
            tempSnapshotMemo = `${TEMP_SNAPSHOT_PREFIX} ${new Date().toISOString()}`;
            await post("/api/repo/createSnapshot", { memo: tempSnapshotMemo });
            await loadSnapshots(1, false);
            const temp = snapshots.find((snapshot) => snapshot.memo === tempSnapshotMemo) ?? snapshots.find((snapshot) => isTempSnapshot(snapshot));
            tempSnapshotId = temp?.id ?? "";
            if (tempSnapshotId) {
                tempSnapshotTag = createTempSnapshotTag();
                await tagTempSnapshot(post, tempSnapshotId, tempSnapshotTag);
            }
            const baseline = snapshots.find((snapshot) => snapshot.id !== tempSnapshotId && !isTempSnapshot(snapshot));

            if (baseline?.id && tempSnapshotId) {
                leftSnapshot = baseline.id;
                rightSnapshot = tempSnapshotId;
                autoDiffReady = true;
                await compareSnapshots();
            } else {
                if (!rightSnapshot && snapshots[0]?.id) rightSnapshot = snapshots[0].id;
                if (!leftSnapshot && snapshots[1]?.id) leftSnapshot = snapshots[1].id;
                autoDiffReady = canCompare;
                if (canCompare) await compareSnapshots();
            }
        } catch (err) {
            error = getErrorMessage(err);
            await loadSnapshots(1, true);
        } finally {
            loadingSnapshots = false;
        }
    }

    async function cleanupTempSnapshotOnClose() {
        if (cleanupStarted || !tempSnapshotTag) return;
        cleanupStarted = true;
        try {
            await cleanupTempSnapshot(post, tempSnapshotTag);
        } catch (err) {
            console.warn("[Sisyphus] failed to cleanup temp snapshot:", err);
        }
    }

    async function loadSnapshots(nextPage = page, autoCompare = true) {
        loadingSnapshots = true;
        error = "";
        try {
            const data = await post<{ snapshots?: Snapshot[]; pageCount?: number; totalCount?: number }>("/api/repo/getRepoSnapshots", { page: nextPage });
            snapshots = data.snapshots ?? [];
            page = nextPage;
            pageCount = Math.max(1, data.pageCount ?? 1);

            try {
                const tags = await post<{ snapshots?: Snapshot[] }>("/api/repo/getRepoTagSnapshots", {});
                tagSnapshots = tags.snapshots ?? [];
            } catch {
                tagSnapshots = [];
            }

            if (!rightSnapshot && snapshots[0]?.id) rightSnapshot = snapshots[0].id;
            if (!leftSnapshot && snapshots[1]?.id) leftSnapshot = snapshots[1].id;
            if (autoCompare && canCompare) await compareSnapshots();
        } catch (err) {
            error = getErrorMessage(err);
        } finally {
            loadingSnapshots = false;
        }
    }

    async function createSnapshot() {
        const text = memo.trim();
        if (!text) {
            showMessage("请先填写本次快照说明");
            return;
        }
        loadingSnapshots = true;
        try {
            await post("/api/repo/createSnapshot", { memo: text });
            memo = "";
            showMessage("快照已创建");
            await loadSnapshots(1, true);
        } catch (err) {
            error = getErrorMessage(err);
        } finally {
            loadingSnapshots = false;
        }
    }

    async function compareSnapshots() {
        if (!canCompare) return;
        loadingDiff = true;
        error = "";
        entries = [];
        oldContent = "";
        newContent = "";
        oldFileContent = null;
        newFileContent = null;
        try {
            const diff = await post<Record<string, RepoSnapshotFileChange[] | unknown>>("/api/repo/diffRepoSnapshots", {
                left: leftSnapshot,
                right: rightSnapshot,
            });
            files = buildChangedFiles(diff);
            selectedFileKey = files[0]?.key ?? "";
            if (selectedFileKey) await loadSelectedFile();
        } catch (err) {
            error = getErrorMessage(err);
        } finally {
            loadingDiff = false;
        }
    }

    async function loadSelectedFile() {
        if (!selectedFile) return;
        loadingFile = true;
        error = "";
        try {
            const oldFileId = getSnapshotFileId(selectedFile.oldFile);
            const newFileId = getSnapshotFileId(selectedFile.newFile);
            const [oldData, newData] = await Promise.all([
                oldFileId ? post<SnapshotFileContent>("/api/repo/openRepoSnapshotFile", { id: oldFileId }) : Promise.resolve(null),
                newFileId ? post<SnapshotFileContent>("/api/repo/openRepoSnapshotFile", { id: newFileId }) : Promise.resolve(null),
            ]);
            oldFileContent = oldData;
            newFileContent = newData;
            oldContent = oldData?.content ?? "";
            newContent = newData?.content ?? "";
            entries = diffSnapshotBlocks(oldContent, newContent);
            if (entries.length === 0 && (oldContent || newContent)) {
                entries = diffSnapshotBlocks(createContentFallback(oldContent, "旧版本内容为空或无法解析"), createContentFallback(newContent, "新版本内容为空或无法解析"));
            }
        } catch (err) {
            error = getErrorMessage(err);
        } finally {
            loadingFile = false;
        }
    }

    async function acceptBlock(entry: BlockDiffEntry, side: "old" | "new") {
        if (!entry.canAcceptBlock) {
            showMessage(entry.acceptReason || "该块暂不支持块级接受");
            return;
        }
        if (side === "new") {
            showMessage("已保留右侧版本");
            return;
        }

        const confirmed = window.confirm("将把当前文档中的这个块恢复为左侧版本，继续吗？");
        if (!confirmed) return;

        applying = true;
        try {
            if (entry.status === "modified" && entry.newBlock?.id && entry.oldBlock) {
                await post("/api/block/updateBlock", {
                    id: entry.newBlock.id,
                    dataType: "markdown",
                    data: entry.oldBlock.markdown || entry.oldBlock.text,
                });
            } else if (entry.status === "added" && entry.newBlock?.id) {
                await post("/api/block/deleteBlock", { id: entry.newBlock.id });
            } else if (entry.status === "removed" && entry.oldBlock) {
                const parentIDs = getRestoreParentCandidates(entry, selectedFile);
                if (parentIDs.length === 0) throw new Error("无法识别可恢复位置，不能安全恢复删除块");
                let restored = false;
                let lastError: unknown;
                for (const parentID of parentIDs) {
                    try {
                        await post("/api/block/appendBlock", {
                            parentID,
                            dataType: "markdown",
                            data: entry.oldBlock.markdown || entry.oldBlock.text,
                        });
                        restored = true;
                        break;
                    } catch (err) {
                        lastError = err;
                    }
                }
                if (!restored) throw lastError ?? new Error("无法恢复删除块");
            }
            showMessage("块级恢复已应用");
        } catch (err) {
            error = getErrorMessage(err);
        } finally {
            applying = false;
        }
    }

    async function rollbackDocument() {
        const id = selectedOldFileId;
        if (!id) return;
        const confirmed = window.confirm("这会把整个文档回档到所选快照文件版本。继续吗？");
        if (!confirmed) return;
        applying = true;
        try {
            await post("/api/repo/rollbackRepoSnapshotFile", { id });
            showMessage("文档已回档");
            await loadSelectedFile();
        } catch (err) {
            error = getErrorMessage(err);
        } finally {
            applying = false;
        }
    }

    function snapshotLabel(snapshot: Snapshot): string {
        if (snapshot.id === tempSnapshotId) return "当前工作区临时快照";
        return snapshot.memo || snapshot.tag || snapshot.hCreated || snapshot.created || snapshot.id;
    }

    function isTempSnapshot(snapshot: Snapshot): boolean {
        return typeof snapshot.memo === "string" && snapshot.memo.startsWith(TEMP_SNAPSHOT_PREFIX);
    }

    function createContentFallback(content: string, fallback: string): string {
        const text = content.trim();
        return text || fallback;
    }

    function getErrorMessage(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
</script>

<div class="vc-shell">
    <aside class="vc-sidebar">
        <section class="vc-section">
            <div class="vc-section__title">创建快照</div>
            <textarea bind:value={memo} rows="3" placeholder="描述这次修改"></textarea>
            <button class="vc-primary" on:click={createSnapshot} disabled={loadingSnapshots}>创建 commit</button>
        </section>

        <section class="vc-section">
            <div class="vc-section__title">版本选择</div>
            <label class="vc-check">
                <input type="checkbox" bind:checked={showTempSnapshots} />
                显示临时快照
            </label>
            <label>
                旧版本
                <select bind:value={leftSnapshot}>
                    {#each visibleSnapshots as snapshot}
                        <option value={snapshot.id}>{snapshotLabel(snapshot)}</option>
                    {/each}
                </select>
            </label>
            <label>
                新版本
                <select bind:value={rightSnapshot}>
                    {#each visibleSnapshots as snapshot}
                        <option value={snapshot.id}>{snapshotLabel(snapshot)}</option>
                    {/each}
                </select>
            </label>
            <button on:click={compareSnapshots} disabled={!canCompare || loadingDiff}>比较</button>
            <div class="vc-pager">
                <button on:click={() => loadSnapshots(Math.max(1, page - 1))} disabled={page <= 1 || loadingSnapshots}>上一页</button>
                <span>{page} / {pageCount}</span>
                <button on:click={() => loadSnapshots(Math.min(pageCount, page + 1))} disabled={page >= pageCount || loadingSnapshots}>下一页</button>
            </div>
        </section>

        {#if tagSnapshots.length}
            <section class="vc-section">
                <div class="vc-section__title">标签快照</div>
                <div class="vc-tags">
                    {#each tagSnapshots as snapshot}
                        <span>{snapshotLabel(snapshot)}</span>
                    {/each}
                </div>
            </section>
        {/if}
    </aside>

    <main class="vc-main">
        <div class="vc-toolbar">
            <div>
                <strong>{autoDiffReady && rightSnapshot === tempSnapshotId ? "当前工作区差异" : "变更文档"}</strong>
                <span>{files.length} 个文件</span>
                {#if rightSnapshot === tempSnapshotId}
                    <span>临时快照将在关闭时清理</span>
                {/if}
            </div>
            <button on:click={rollbackDocument} disabled={!selectedFile || applying}>整篇回档到左侧版本</button>
        </div>

        {#if error}
            <div class="vc-error">{error}</div>
        {/if}

        <div class="vc-content">
            <nav class="vc-files">
                {#if loadingDiff || loadingSnapshots}
                    <div class="vc-empty">加载中...</div>
                {:else if files.length === 0}
                    <div class="vc-empty">暂无可显示的变更</div>
                {:else}
                    {#each files as file}
                        <button class:selected={file.key === selectedFileKey} on:click={() => { selectedFileKey = file.key; loadSelectedFile(); }}>
                            <span class:added={file.kind === "added"} class:removed={file.kind === "removed"} class:modified={file.kind === "modified"}>{file.kind}</span>
                            <strong>{file.title}</strong>
                        </button>
                    {/each}
                {/if}
            </nav>

            <section class="vc-diff">
                {#if loadingFile}
                    <div class="vc-empty">正在打开快照文件...</div>
                {:else if !selectedFile}
                    <div class="vc-empty">选择一个变更文档查看前后差异</div>
                {:else}
                    <div class="vc-diff-head">
                        <div>旧版本 {oldFileContent?.updated ? `· ${oldFileContent.updated}` : ""}</div>
                        <div>新版本 {newFileContent?.updated ? `· ${newFileContent.updated}` : ""}</div>
                    </div>
                    {#if entries.length === 0}
                        <div class="vc-empty">该文件内容为空，或当前快照内容暂无法解析为可显示块。</div>
                    {/if}
                    <div class="vc-diff-grid">
                        {#each entries as entry}
                            <article class="vc-block old {entry.status}">
                                <div class="vc-block__meta">
                                    <span>{entry.status}</span>
                                    {#if entry.oldBlock?.id}<code>{entry.oldBlock.id}</code>{/if}
                                </div>
                                <pre>{entry.oldBlock?.markdown || entry.oldBlock?.text || (entry.status === "added" ? "右侧新增，左侧无内容" : "")}</pre>
                            </article>
                            <article class="vc-block new {entry.status}">
                                <div class="vc-block__meta">
                                    <span>{entry.status}</span>
                                    {#if entry.newBlock?.id}<code>{entry.newBlock.id}</code>{/if}
                                </div>
                                <pre>{entry.newBlock?.markdown || entry.newBlock?.text || (entry.status === "removed" ? "左侧存在，右侧已删除" : "")}</pre>
                                {#if entry.status !== "unchanged"}
                                    <div class="vc-actions">
                                        <button on:click={() => acceptBlock(entry, "old")} disabled={applying || !entry.canAcceptBlock}>采用旧版</button>
                                        <button on:click={() => acceptBlock(entry, "new")} disabled={applying}>采用新版</button>
                                    </div>
                                    {#if entry.acceptReason}
                                        <small>{entry.acceptReason}</small>
                                    {/if}
                                {/if}
                            </article>
                        {/each}
                    </div>
                {/if}
            </section>
        </div>
    </main>
</div>

<style>
    .vc-shell {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        height: 78vh;
        min-height: 520px;
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-background);
    }

    .vc-sidebar {
        border-right: 1px solid var(--b3-border-color);
        padding: 12px;
        overflow: auto;
    }

    .vc-section {
        display: grid;
        gap: 8px;
        margin-bottom: 18px;
    }

    .vc-section__title {
        font-weight: 600;
        font-size: 13px;
    }

    label {
        display: grid;
        gap: 4px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
    }

    .vc-check {
        grid-template-columns: auto 1fr;
        align-items: center;
    }

    textarea,
    select {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 8px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
    }

    button {
        min-height: 30px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 4px 10px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        cursor: pointer;
    }

    button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    .vc-primary {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        border-color: var(--b3-theme-primary);
    }

    .vc-pager {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 6px;
        align-items: center;
        font-size: 12px;
    }

    .vc-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .vc-tags span {
        border: 1px solid var(--b3-border-color);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 12px;
    }

    .vc-main {
        min-width: 0;
        display: grid;
        grid-template-rows: auto 1fr;
    }

    .vc-toolbar {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        border-bottom: 1px solid var(--b3-border-color);
        padding: 10px 12px;
    }

    .vc-toolbar span {
        margin-left: 8px;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }

    .vc-error {
        margin: 10px 12px 0;
        padding: 8px 10px;
        border: 1px solid var(--b3-theme-error);
        border-radius: 6px;
        color: var(--b3-theme-error);
    }

    .vc-content {
        min-height: 0;
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
    }

    .vc-files {
        border-right: 1px solid var(--b3-border-color);
        overflow: auto;
        padding: 8px;
    }

    .vc-files button {
        width: 100%;
        display: grid;
        grid-template-columns: 68px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        text-align: left;
    }

    .vc-files button.selected {
        border-color: var(--b3-theme-primary);
        background: var(--b3-list-hover);
    }

    .vc-files strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
    }

    .vc-files span {
        border-radius: 4px;
        padding: 2px 5px;
        text-align: center;
        font-size: 11px;
    }

    .vc-files .added {
        background: rgba(46, 160, 67, 0.2);
        color: #2ea043;
    }

    .vc-files .removed {
        background: rgba(248, 81, 73, 0.2);
        color: #f85149;
    }

    .vc-files .modified {
        background: rgba(210, 153, 34, 0.2);
        color: #d29922;
    }

    .vc-diff {
        min-width: 0;
        overflow: auto;
    }

    .vc-diff-head,
    .vc-diff-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .vc-diff-head {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--b3-theme-background);
        border-bottom: 1px solid var(--b3-border-color);
        font-size: 12px;
        color: var(--b3-theme-on-surface);
    }

    .vc-diff-head div {
        padding: 8px 12px;
    }

    .vc-block {
        min-width: 0;
        border-bottom: 1px solid var(--b3-border-color);
        padding: 8px 12px;
    }

    .vc-block.old.modified,
    .vc-block.old.removed {
        background: rgba(248, 81, 73, 0.14);
    }

    .vc-block.new.modified,
    .vc-block.new.added {
        background: rgba(46, 160, 67, 0.14);
    }

    .vc-block__meta {
        display: flex;
        gap: 8px;
        align-items: center;
        min-height: 20px;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
    }

    .vc-block__meta code {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    pre {
        min-height: 22px;
        margin: 4px 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-family: var(--b3-font-family-code);
        font-size: 12px;
        line-height: 1.55;
    }

    .vc-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
    }

    small {
        display: block;
        margin-top: 6px;
        color: var(--b3-theme-on-surface);
    }

    .vc-empty {
        padding: 16px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    @media (max-width: 900px) {
        .vc-shell,
        .vc-content {
            grid-template-columns: 1fr;
            height: auto;
        }

        .vc-sidebar,
        .vc-files {
            border-right: 0;
            border-bottom: 1px solid var(--b3-border-color);
        }
    }
</style>
