import ReactSave from './examples/SaveRestore'
import VueSave from './examples/SaveRestore.vue'
import reactSave from './examples/SaveRestore.jsx?raw'
import vueSave from './examples/SaveRestore.vue?raw'
import ReactLoad from './examples/LoadBoard'
import VueLoad from './examples/LoadBoard.vue'
import reactLoad from './examples/LoadBoard.jsx?raw'
import vueLoad from './examples/LoadBoard.vue?raw'
import ReactRefresh from './examples/RefreshBoard'
import VueRefresh from './examples/RefreshBoard.vue'
import reactRefresh from './examples/RefreshBoard.jsx?raw'
import vueRefresh from './examples/RefreshBoard.vue?raw'
export const recipes = {
  save: { react: ReactSave, vue: VueSave, reactSource: reactSave, vueSource: vueSave },
  load: { react: ReactLoad, vue: VueLoad, reactSource: reactLoad, vueSource: vueLoad },
  refresh: {
    react: ReactRefresh,
    vue: VueRefresh,
    reactSource: reactRefresh,
    vueSource: vueRefresh
  }
}
