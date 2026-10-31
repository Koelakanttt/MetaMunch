export const THEMES = [
  { id: 'pixel', label: 'Pixel Green' },
  { id: 'slate', label: 'Slate' },
  { id: 'reforged', label: 'Reforged' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'pixel'

export function isThemeId(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}
