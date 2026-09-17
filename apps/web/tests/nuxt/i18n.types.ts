import type { MessageKey, MessageSchema } from '../../i18n/schema'
import type { DefineLocaleMessage } from 'vue-i18n'

// Included by Nuxt's app typecheck, without requiring a running dev server.
const validKey: MessageKey = 'kicad.setup.steps.install.title'
// @ts-expect-error Misspelled keys must not enter typed step definitions.
const invalidKey: MessageKey = 'kicad.setup.steps.instal.title'
// @ts-expect-error A namespace is not a translatable leaf.
const namespaceKey: MessageKey = 'kicad.setup'
// @ts-expect-error Additional locales must contain every English message.
const incompleteLocale: MessageSchema = { common: { chooseFile: 'Choisir un fichier' } }
const moduleSchema: DefineLocaleMessage['common']['chooseFile'] = 'Choose file'
void [validKey, invalidKey, namespaceKey, incompleteLocale, moduleSchema]
