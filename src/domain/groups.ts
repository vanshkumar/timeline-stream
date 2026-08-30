import type { ConflictState } from "./entry";

export interface IdentityVariant {
  path: string;
  id: string;
  raw: string;
}

export interface GroupedVariant<T extends IdentityVariant> {
  item: T;
  conflict: ConflictState;
  duplicateCount: number;
  visible: boolean;
}

export function groupIdentityVariants<T extends IdentityVariant>(items: T[]): GroupedVariant<T>[] {
  const byId = new Map<string, T[]>();
  for (const item of items) {
    const group = byId.get(item.id) ?? [];
    group.push(item);
    byId.set(item.id, group);
  }

  const grouped: GroupedVariant<T>[] = [];
  for (const variants of byId.values()) {
    variants.sort((left, right) => left.path.localeCompare(right.path));
    if (variants.length === 1) {
      grouped.push({ item: variants[0]!, conflict: "none", duplicateCount: 1, visible: true });
      continue;
    }

    const identical = variants.every((variant) => variant.raw === variants[0]!.raw);
    variants.forEach((variant, index) => {
      grouped.push({
        item: variant,
        conflict: identical ? "identical" : "divergent",
        duplicateCount: variants.length,
        visible: !identical || index === 0
      });
    });
  }
  return grouped;
}
