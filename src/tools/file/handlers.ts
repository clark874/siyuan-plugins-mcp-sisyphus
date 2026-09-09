import type { FileAction } from '../../core/config';
import {
    FileIdentifyProjectSchema,
    FileListProjectSourcesSchema,
    FileReadProjectSourceSchema,
    FileRegisterProjectSourceSchema,
    FileResolveProjectSourceSchema,
    FileScanProjectManifestSchema,
} from '../../core/types';
import type { ToolActionHandler } from '../internal/define-tool';
import { createJsonResult } from '../internal/shared';

export const FILE_TOOL_NAME = 'file';

const handleRegisterProjectSource: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileRegisterProjectSourceSchema.parse(rawArgs);
    const { registerProjectSource } = await import('../../core/project-sources');
    return createJsonResult(await registerProjectSource(client, parsed));
};

const handleIdentifyProject: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileIdentifyProjectSchema.parse(rawArgs);
    const { identifyProjectSource } = await import('../../core/project-sources');
    return createJsonResult(await identifyProjectSource(client, parsed));
};

const handleScanProjectManifest: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileScanProjectManifestSchema.parse(rawArgs);
    const { scanProjectManifest } = await import('../../core/project-sources');
    return createJsonResult(await scanProjectManifest(client, parsed));
};

const handleResolveProjectSource: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileResolveProjectSourceSchema.parse(rawArgs);
    const { resolveProjectSource } = await import('../../core/project-sources');
    return createJsonResult(await resolveProjectSource(client, parsed));
};

const handleReadProjectSource: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileReadProjectSourceSchema.parse(rawArgs);
    const { readProjectSource } = await import('../../core/project-sources');
    return createJsonResult(await readProjectSource(client, parsed));
};

const handleListProjectSources: ToolActionHandler = async ({ client, rawArgs }) => {
    const parsed = FileListProjectSourcesSchema.parse(rawArgs);
    const { listProjectSources } = await import('../../core/project-sources');
    return createJsonResult(await listProjectSources(client, parsed));
};

export const FILE_ACTION_HANDLERS: Record<FileAction, ToolActionHandler> = {
    register_project_source: handleRegisterProjectSource,
    identify_project: handleIdentifyProject,
    scan_project_manifest: handleScanProjectManifest,
    resolve_project_source: handleResolveProjectSource,
    read_project_source: handleReadProjectSource,
    list_project_sources: handleListProjectSources,
};
