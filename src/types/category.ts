export const CATEGORY_COLORS = ['blue', 'purple', 'green', 'pink', 'orange', 'red', 'gray', 'indigo', 'yellow', 'slate'] as const;
export type CategoryColor = typeof CATEGORY_COLORS[number];

export interface TargetCategory {
  id: string;
  name: string;
  color: CategoryColor;
}
