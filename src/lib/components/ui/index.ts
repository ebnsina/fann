/**
 * UI primitive barrel.
 *
 * These are the only building blocks app code should reach for. They reference
 * semantic tokens exclusively (see `src/routes/layout.css`), which is what makes
 * dark mode and the radius-0 rule hold without per-component effort.
 */
export { default as Avatar } from './Avatar.svelte';
export { default as Badge } from './Badge.svelte';
export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';
export { default as Checkbox } from './Checkbox.svelte';
export { default as Dialog } from './Dialog.svelte';
export { default as EmptyState } from './EmptyState.svelte';
export { default as Field } from './Field.svelte';
export { default as Input } from './Input.svelte';
export { default as Kbd } from './Kbd.svelte';
export { default as Markdown } from './Markdown.svelte';
export { default as Select } from './Select.svelte';
export { default as Skeleton } from './Skeleton.svelte';
export { default as Spinner } from './Spinner.svelte';
export { default as Switch } from './Switch.svelte';
export { default as Table } from './Table.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as Td } from './Td.svelte';
export { default as Textarea } from './Textarea.svelte';
export { default as Th } from './Th.svelte';
export { default as Toaster } from './Toaster.svelte';
export { default as Tooltip } from './Tooltip.svelte';

export { toast } from './toast.svelte';
export type { Toast, ToastTone } from './toast.svelte';
export type { ButtonSize, ButtonVariant } from './Button.svelte';
export type { BadgeTone } from './Badge.svelte';
export type { SelectOption } from './Select.svelte';
export type { TabItem } from './Tabs.svelte';
