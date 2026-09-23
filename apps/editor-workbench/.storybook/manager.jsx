import React from 'react'
import { addons, types, useGlobals } from 'storybook/manager-api'
import { IconButton, TooltipLinkList, WithTooltip } from 'storybook/internal/components'
import { siReact, siVuedotjs, siNextdotjs, siNuxt, siJavascript } from 'simple-icons'

const frameworks = [
  { value: 'react', title: 'React', icon: siReact },
  { value: 'vue', title: 'Vue', icon: siVuedotjs },
  { value: 'next', title: 'Next.js', icon: siNextdotjs },
  { value: 'nuxt', title: 'Nuxt', icon: siNuxt },
  { value: 'javascript', title: 'JavaScript', icon: siJavascript },
]
const Logo = ({ icon }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d={icon.path} />
  </svg>
)
const FrameworkSelector = () => {
  const [globals, updateGlobals, storyGlobals] = useGlobals()
  const current = frameworks.find(item => item.value === globals.framework) || frameworks[2]
  const locked = storyGlobals.framework !== undefined
  return (
    <WithTooltip placement="bottom" trigger="click" closeOnOutsideClick tooltip={({ onHide }) => (
      <TooltipLinkList links={frameworks.map(item => ({
        id: item.value,
        title: item.title,
        icon: <Logo icon={item.icon} />,
        active: item.value === current.value,
        onClick: () => { updateGlobals({ framework: item.value }); onHide() },
      }))} />
    )}>
      <IconButton disabled={locked} title={`Framework: ${current.title}`} aria-label={`Framework: ${current.title}`}>
        <Logo icon={current.icon} />
        <span style={{ marginLeft: 6 }}>{current.title}</span>
      </IconButton>
    </WithTooltip>
  )
}
addons.register('overprint/framework', () => {
  addons.add('overprint/framework/selector', {
    title: 'Framework', type: types.TOOL, render: () => <FrameworkSelector />,
  })
})
