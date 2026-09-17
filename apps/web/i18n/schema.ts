import type common from './locales/en/common.json'
import type editor from './locales/en/editor.json'
import type kicad from './locales/en/kicad.json'
import type exportMessages from './locales/en/export.json'

// English defines the shape; translated values remain ordinary strings.
export type MessageSchema = typeof common & typeof editor & typeof kicad & typeof exportMessages

type LeafKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafKeys<T[K]>}`
}[keyof T & string]

export type MessageKey = LeafKeys<MessageSchema>
