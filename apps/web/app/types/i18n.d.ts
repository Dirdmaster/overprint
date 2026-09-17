import type { MessageSchema } from '../../i18n/schema'

declare module 'vue-i18n' {
  interface DefineLocaleMessage extends MessageSchema {}
}

export {}
