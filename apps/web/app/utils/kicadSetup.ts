import type { MessageKey } from '../../i18n/schema'

type SetupStep = {
  id: string
  titleKey: MessageKey
  descriptionKey: MessageKey
  action?: 'copy-repository'
}

export const kicadSetupSteps = [
  { id: 'repository', titleKey: 'kicad.setup.steps.repository.title', descriptionKey: 'kicad.setup.steps.repository.description', action: 'copy-repository' },
  { id: 'install', titleKey: 'kicad.setup.steps.install.title', descriptionKey: 'kicad.setup.steps.install.description' },
  { id: 'restart', titleKey: 'kicad.setup.steps.restart.title', descriptionKey: 'kicad.setup.steps.restart.description' },
  { id: 'scan', titleKey: 'kicad.setup.steps.scan.title', descriptionKey: 'kicad.setup.steps.scan.description' },
] as const satisfies readonly SetupStep[]
