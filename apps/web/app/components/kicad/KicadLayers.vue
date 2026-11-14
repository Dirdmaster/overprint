<script setup lang="ts">
import { useComposition } from '../../composables/project/useComposition'
import { useLivePaint } from '../../composables/artwork/useLivePaint'
import { useNativeSilk } from '../../composables/artwork/useNativeSilk'
import { useArtwork } from '../../composables/artwork/useArtwork'
import ColorSwatchPicker from '../color/ColorSwatchPicker.vue'
import { ref, computed } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Eye,
  EyeOff,
  Image,
  Ruler,
  LockKeyhole
} from '@lucide/vue'
import { nativeSilkId, nativeSilkSettings } from '../../utils/nativeSilk'
const props = withDefaults(
  defineProps<{ side: string; variant?: 'full' | 'artboard' | 'reference' }>(),
  { variant: 'full' }
)
const { side: activeSide } = useComposition()
const silk = defineModel<boolean>('silk', { required: true })
const fabrication = defineModel<boolean>('fabrication', { required: true })
const { items, selection } = useArtwork()
const { setBaseColor, resetColors } = useNativeSilk()
const { presets } = useLivePaint()
const expanded = ref(true)
const selectKicad = () => {
  activeSide.value = props.side
  selection.value = nativeSilkId(props.side)
  expanded.value = true
}
const selected = computed(() => selection.value === nativeSilkId(props.side))
const settings = computed(() => nativeSilkSettings(items.value, props.side))
const baseColor = computed({
  get: () => settings.value?.baseColor ?? '#ffffff',
  set: (value) => setBaseColor(props.side, value)
})
</script>

<template>
  <div
    :class="variant === 'artboard' ? 'mx-3 pb-2' : 'mx-3 mt-3 border-t border-line pt-2'"
    :aria-label="variant === 'artboard' ? `${side} source layers` : 'KiCad layers'"
  >
    <div
      v-if="variant !== 'artboard'"
      class="flex items-center gap-2 rounded-md p-1"
    >
      <button
        class="p-1 text-muted"
        :aria-label="`${expanded ? 'Collapse' : 'Expand'} KiCad`"
        @click="expanded = !expanded"
      >
        <component
          :is="expanded ? ChevronDown : ChevronRight"
          class="size-3"
        />
      </button>
      <Folder class="size-4 text-muted" />
      <button
        class="flex-1 py-2 text-left font-medium"
        @click="selectKicad"
      >
        KiCad
      </button>
      <LockKeyhole
        class="size-3.5 text-muted"
        aria-label="Geometry controlled by KiCad"
      />
    </div>
    <div
      v-if="expanded"
      :class="variant === 'artboard' ? 'pl-1' : 'pl-4'"
    >
      <div
        class="flex items-center gap-2 rounded-md p-1"
        :class="selected ? 'bg-soft' : ''"
      >
        <button
          v-if="variant !== 'artboard'"
          role="checkbox"
          :aria-checked="silk"
          aria-label="Silkscreen"
          class="p-1 text-muted"
          @click="silk = !silk"
        >
          <component
            :is="silk ? Eye : EyeOff"
            class="size-4"
          />
        </button>
        <Image class="size-4 shrink-0 text-muted" />
        <button
          v-if="variant !== 'reference'"
          class="flex-1 py-2 text-left"
          :aria-pressed="selected"
          :aria-label="
            side === activeSide
              ? 'KiCad silkscreen'
              : `${side === 'front' ? 'Front' : 'Back'} KiCad silkscreen`
          "
          @click="selectKicad"
        >
          Silkscreen
        </button>
        <span
          v-else
          class="flex-1 py-2"
        >
          Silkscreen
        </span>
        <LockKeyhole
          v-if="variant === 'artboard'"
          class="size-3.5 text-muted"
        />
      </div>
      <div
        v-if="variant !== 'artboard'"
        class="flex items-center gap-2 p-1 text-muted"
      >
        <button
          role="checkbox"
          :aria-checked="fabrication"
          aria-label="Fabrication overlay"
          class="p-1"
          @click="fabrication = !fabrication"
        >
          <component
            :is="fabrication ? Eye : EyeOff"
            class="size-4"
          />
        </button>
        <Ruler class="size-4 shrink-0" />
        <span class="flex-1 py-2">Fabrication overlay</span>
        <LockKeyhole class="size-3.5" />
      </div>
    </div>
    <div
      v-if="selected && variant !== 'reference'"
      class="mt-3 flex items-center justify-between gap-2 px-1"
    >
      <span class="text-muted">Base ink</span>
      <ColorSwatchPicker
        v-model="baseColor"
        label="KiCad ink color"
        :presets="presets"
        custom
      />
    </div>
    <button
      v-if="selected && settings && variant !== 'reference'"
      class="mt-2 px-1 text-xs text-muted underline hover:text-ink"
      @click="resetColors(side)"
    >
      Reset KiCad colors
    </button>
  </div>
</template>
