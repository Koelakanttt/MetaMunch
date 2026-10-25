import type { Item } from '../../src/shared/ddragon'

export function stats(...pairs: Array<[number | string, string]>): string {
  const lines = pairs.map(([v, label]) => `<attention>${v}</attention> ${label}`).join('<br>')
  return `<mainText><stats>${lines}</stats></mainText>`
}

export function mkItem(id: number, name: string, over: Partial<Item> = {}): Item {
  return {
    id,
    name,
    plaintext: '',
    description: '',
    tags: [],
    stats: {},
    goldTotal: 3000,
    purchasable: true,
    from: [],
    into: [],
    maps: { '11': true },
    inStore: true,
    requiredAlly: null,
    requiredChampion: null,
    ...over,
  }
}
