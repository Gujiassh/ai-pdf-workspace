import type { Asset, Note, Tag } from "@/lib/workspace-context";

import type { NoteDto, TagDto } from "./types";

export function toUiTag(tag: TagDto): Tag {
  return {
    id: tag.id,
    workspaceId: tag.workspaceId,
    name: tag.name,
    color: tag.color ?? "#71717a",
  };
}

export function toUiNote(note: NoteDto, tagsById: Map<string, Tag>): Note {
  const source = note.sources[0];
  return {
    id: note.id,
    workspaceId: note.workspaceId,
    title: note.title?.trim() || "Untitled note",
    content: note.bodyMd,
    source: source
      ? {
          messageCitationId: source.messageCitationId ?? undefined,
          assetId: source.assetId,
          assetKind: source.assetKind,
          assetTitle: source.assetTitle,
          sourceAvailable: source.sourceAvailable,
          excerpt: source.excerpt,
          locator: source.locator,
          sourceVersions: source.sourceVersions,
        }
      : undefined,
    tags: note.tagIds
      .map((tagId) => tagsById.get(tagId)?.name)
      .filter((name): name is string => Boolean(name)),
    createdAt: note.createdAt,
  };
}

export function applyAssetTags(assets: Asset[], tags: TagDto[]): Asset[] {
  const tagNamesByAssetId = new Map<string, string[]>();
  for (const tag of tags) {
    for (const assetId of tag.assetIds ?? []) {
      const names = tagNamesByAssetId.get(assetId) ?? [];
      names.push(tag.name);
      tagNamesByAssetId.set(assetId, names);
    }
  }
  return assets.map((asset) => ({
    ...asset,
    tags: tagNamesByAssetId.get(asset.id) ?? [],
  }));
}
