import type { WorkspacePreset } from '../App';
import type { EditorPage } from '../components/PageNavigation/PageNavigation';

const VALID_EDITOR_PAGES: ReadonlySet<EditorPage> = new Set<EditorPage>(['media', 'cut', 'edit', 'color', 'deliver']);
const VALID_WORKSPACES: ReadonlySet<WorkspacePreset> = new Set<WorkspacePreset>(['filmtv', 'news', 'sports', 'creator', 'marketing']);

export function resolveEditorPageParam(param: string | null): EditorPage {
  return param && VALID_EDITOR_PAGES.has(param as EditorPage) ? (param as EditorPage) : 'edit';
}

export function resolveWorkspaceParam(param: string | null): WorkspacePreset {
  return param && VALID_WORKSPACES.has(param as WorkspacePreset) ? (param as WorkspacePreset) : 'filmtv';
}
