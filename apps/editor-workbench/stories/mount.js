import { mount as react } from './examples/react'
import { mount as vue } from './examples/vue'
import { mount as vanilla } from './examples/vanilla'

const mounts = { react, vue, vanilla }
export const mountEditor = (framework, target, controller) => mounts[framework](target, controller)
