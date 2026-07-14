import { wouldCreateCycle } from './folder-cycle';

/** Tree: root(A) -> B -> C, plus a separate root D. */
const parents: Record<string, string | null> = {
  A: null,
  B: 'A',
  C: 'B',
  D: null,
};
const getParentId = (id: string) => parents[id];

describe('wouldCreateCycle', () => {
  it('rejects a folder becoming its own parent', () => {
    expect(wouldCreateCycle('A', 'A', getParentId)).toBe(true);
  });

  it('rejects moving an ancestor under its direct child', () => {
    // A is B's parent; moving A under B would make A its own descendant.
    expect(wouldCreateCycle('A', 'B', getParentId)).toBe(true);
  });

  it('rejects moving an ancestor under a deeper descendant', () => {
    // A is C's grandparent; moving A under C is still a cycle.
    expect(wouldCreateCycle('A', 'C', getParentId)).toBe(true);
  });

  it('allows moving a folder under an unrelated root', () => {
    expect(wouldCreateCycle('B', 'D', getParentId)).toBe(false);
  });

  it('allows moving a folder to a target that is not its descendant', () => {
    // C moving under D is fine — D is not a descendant of C.
    expect(wouldCreateCycle('C', 'D', getParentId)).toBe(false);
  });

  it('allows moving a leaf under its own sibling', () => {
    // C (child of B) moving under D is unrelated to B's subtree.
    expect(wouldCreateCycle('C', 'D', getParentId)).toBe(false);
  });

  it('does not infinite-loop against a pre-existing corrupt cycle', () => {
    const corrupt: Record<string, string | null> = { X: 'Y', Y: 'X' };
    expect(() => wouldCreateCycle('Z', 'X', (id) => corrupt[id])).not.toThrow();
  });
});
