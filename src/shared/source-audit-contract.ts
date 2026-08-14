import { z } from 'zod';

import { stableStringify } from '../control-plane/security';
import { sha256Hex } from './crypto';

const InventoryItemSchema = z.object({
    id: z.string().trim().min(1).max(160),
    file: z.string().trim().min(1).max(1024),
    symbol: z.string().trim().min(1).max(256).optional(),
    lineStart: z.number().int().min(1),
    lineEnd: z.number().int().min(1),
    beforeBehavior: z.string().trim().min(1).max(20_000),
    afterBehavior: z.string().trim().min(1).max(20_000),
    risk: z.enum(['low', 'medium', 'high', 'critical']),
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/i),
}).superRefine((value, ctx) => {
    if (value.lineEnd < value.lineStart) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lineEnd'], message: 'lineEnd must be greater than or equal to lineStart.' });
    }
});

const InventorySchema = z.object({
    schemaVersion: z.literal(1),
    items: z.array(InventoryItemSchema).max(10_000),
});

const UsageSchema = z.object({
    inventoryId: z.string().trim().min(1).max(160),
    status: z.enum(['used', 'unused', 'obsolete', 'risky']),
    evidence: z.array(z.string().trim().min(1).max(1024)).max(100).default([]),
});

const UsageMapSchema = z.object({
    schemaVersion: z.literal(1),
    projects: z.array(z.object({
        id: z.string().trim().min(1).max(160),
        name: z.string().trim().min(1).max(256),
        usages: z.array(UsageSchema).max(10_000),
    })).max(1_000),
});

export interface SourceAuditBundle {
    inventory: unknown;
    usageMap: unknown;
    baselinesMarkdown: unknown;
}

export interface SourceAuditValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    summary: { inventoryItems: number; projects: number; usageRecords: number; coveredInventoryItems: number };
    bundleHash: string;
    hint: string;
}

function issueText(prefix: string, issue: z.ZodIssue): string {
    return `${prefix}.${issue.path.join('.') || '<root>'}: ${issue.message}`;
}

export function validateSourceAuditBundle(bundle: SourceAuditBundle): SourceAuditValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const inventoryResult = InventorySchema.safeParse(bundle.inventory);
    const usageResult = UsageMapSchema.safeParse(bundle.usageMap);
    if (!inventoryResult.success) errors.push(...inventoryResult.error.issues.map((issue) => issueText('inventory', issue)));
    if (!usageResult.success) errors.push(...usageResult.error.issues.map((issue) => issueText('usageMap', issue)));
    const baselinesMarkdown = typeof bundle.baselinesMarkdown === 'string' ? bundle.baselinesMarkdown : '';
    if (!baselinesMarkdown.trim()) {
        errors.push('baselinesMarkdown: a non-empty frozen baseline record is required.');
    } else {
        if (!/\b[a-f0-9]{40}\b/i.test(baselinesMarkdown)) errors.push('baselinesMarkdown: at least one full 40-character Git commit is required.');
        if (!/\b[a-f0-9]{64}\b/i.test(baselinesMarkdown)) errors.push('baselinesMarkdown: at least one SHA-256 digest is required.');
    }

    const inventoryItems = inventoryResult.success ? inventoryResult.data.items : [];
    const projects = usageResult.success ? usageResult.data.projects : [];
    const inventoryIds = new Set<string>();
    for (const item of inventoryItems) {
        if (inventoryIds.has(item.id)) errors.push(`inventory.items: duplicate id "${item.id}".`);
        inventoryIds.add(item.id);
    }
    const projectIds = new Set<string>();
    const referencedInventoryIds = new Set<string>();
    for (const project of projects) {
        if (projectIds.has(project.id)) errors.push(`usageMap.projects: duplicate id "${project.id}".`);
        projectIds.add(project.id);
        for (const usage of project.usages) {
            if (!inventoryIds.has(usage.inventoryId)) {
                errors.push(`usageMap: inventoryId "${usage.inventoryId}" does not exist in inventory.`);
            } else {
                referencedInventoryIds.add(usage.inventoryId);
            }
            if ((usage.status === 'used' || usage.status === 'risky') && usage.evidence.length === 0) {
                warnings.push(`usageMap: ${project.id}/${usage.inventoryId} is ${usage.status} but has no usage evidence.`);
            }
        }
    }
    for (const id of inventoryIds) {
        if (!referencedInventoryIds.has(id)) warnings.push(`inventory: "${id}" is not classified by any project.`);
    }

    const normalized = {
        inventory: inventoryResult.success ? inventoryResult.data : bundle.inventory,
        usageMap: usageResult.success ? usageResult.data : bundle.usageMap,
        baselinesMarkdown,
    };
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        summary: {
            inventoryItems: inventoryItems.length,
            projects: projects.length,
            usageRecords: projects.reduce((total, project) => total + project.usages.length, 0),
            coveredInventoryItems: referencedInventoryIds.size,
        },
        bundleHash: `sha256:v1:${sha256Hex(stableStringify(normalized))}`,
        hint: 'This validates the frozen handoff contract only; it does not verify source code or infer project conclusions.',
    };
}
