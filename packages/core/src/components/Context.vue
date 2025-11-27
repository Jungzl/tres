<script setup lang="ts">
import type { TresContext } from '../composables'
import type { TresCanvasEmits, TresCanvasInstance, TresCanvasProps } from './types'
import { shallowRef } from 'vue'
import { useTresContextProvider, useTresContextRoot } from '../composables'

const props = defineProps<TresCanvasProps & { canvas: HTMLCanvasElement }>()

const emit = defineEmits<TresCanvasEmits>()

defineSlots<{
  default: () => any
}>()

const context = shallowRef<TresContext>(useTresContextProvider({
  canvas: props.canvas,
  windowSize: props.windowSize ?? false,
  rendererOptions: props,
}))

const { dispose } = useTresContextRoot(context, props, emit)

defineExpose<TresCanvasInstance>({ context, dispose: () => dispose(context.value, true) })
</script>
