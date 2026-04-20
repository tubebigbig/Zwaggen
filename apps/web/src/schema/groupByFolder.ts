export interface FolderNode<T> {
  /** Final segment of this folder's path. Empty for the virtual root. */
  name: string;
  /** Full slash-joined path from root. Empty for the virtual root. */
  path: string;
  /** Items whose folder equals this node's path, in input order. */
  items: T[];
  /** Child folders, sorted alphabetically by name. */
  children: FolderNode<T>[];
  /** Items in this node + all descendants. */
  totalCount: number;
}

export function groupByFolder<T>(
  items: T[],
  getFolder: (item: T) => string | undefined,
): FolderNode<T> {
  const root: FolderNode<T> = { name: '', path: '', items: [], children: [], totalCount: 0 };

  function ensure(segments: string[]): FolderNode<T> {
    let node = root;
    let pathAcc = '';
    for (const seg of segments) {
      pathAcc = pathAcc ? `${pathAcc}/${seg}` : seg;
      let next = node.children.find((c) => c.name === seg);
      if (!next) {
        next = { name: seg, path: pathAcc, items: [], children: [], totalCount: 0 };
        node.children.push(next);
      }
      node = next;
    }
    return node;
  }

  for (const item of items) {
    const folder = getFolder(item);
    if (!folder) {
      root.items.push(item);
    } else {
      ensure(folder.split('/')).items.push(item);
    }
  }

  const sortAndCount = (node: FolderNode<T>): number => {
    node.children.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    let total = node.items.length;
    for (const c of node.children) total += sortAndCount(c);
    node.totalCount = total;
    return total;
  };
  sortAndCount(root);
  return root;
}
