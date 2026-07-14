/**
 * Pure function, no I/O — `FoldersService.move` loads the store's full
 * id -> parentId map (one cheap query) and hands it here rather than
 * walking the tree with N round-trips. A folder can't become its own
 * descendant: check the immediate self-parent case, then walk the target's
 * ancestor chain looking for `folderId`.
 *
 * `seen` guards against an already-corrupt map (a cycle that predates this
 * check) causing an infinite loop — defensive, not expected to trigger in
 * practice since this function is the only thing that ever sets `parent_id`.
 */
export function wouldCreateCycle(
  folderId: string,
  targetParentId: string,
  getParentId: (id: string) => string | null | undefined,
): boolean {
  if (folderId === targetParentId) {
    return true;
  }

  const seen = new Set<string>();
  let current: string | null | undefined = targetParentId;
  while (current) {
    if (current === folderId) {
      return true;
    }
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    current = getParentId(current);
  }
  return false;
}
