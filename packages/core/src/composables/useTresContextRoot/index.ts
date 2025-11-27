import type { TresCanvasProps } from 'src/components/types'
import type { TresObject, TresScene } from 'src/types'
import type { App, ShallowRef } from 'vue'
import type { TresContext } from '../useTresContextProvider'
import { promiseTimeout } from '@vueuse/core'
import { PerspectiveCamera, WebGLRenderer } from 'three'
import * as THREE from 'three'
import {
  createRenderer,
  defineComponent,
  Fragment,
  getCurrentInstance,
  h,
  onMounted,
  onUnmounted,
  provide,
  toValue,
  useSlots,
  watch,
  watchEffect,
} from 'vue'
import { extend } from '../../core/catalogue'
import { nodeOps } from '../../core/nodeOps'
import { registerTresDevtools } from '../../devtools'
import { disposeObject3D } from '../../utils'
import { INJECTION_KEY as CONTEXT_INJECTION_KEY } from '../useTresContextProvider'

export function useTresContextRoot(
  context: ShallowRef<TresContext>,
  props: TresCanvasProps,
  emit: ReturnType<typeof defineEmits>,
) {
  const instance = getCurrentInstance()
  extend(THREE)

  const slots = useSlots()

  const createInternalComponent = (ctxValue: TresContext, empty = false) =>
    defineComponent({
      setup() {
        const ctx = getCurrentInstance()?.appContext
        if (ctx) { ctx.app = instance?.appContext.app as App }
        const provides: { [key: string | symbol]: unknown } = {}

        // Helper function to recursively merge provides from parents
        function mergeProvides(currentInstance: any) {
          if (!currentInstance) { return }

          // Recursively process the parent instance
          if (currentInstance.parent) {
            mergeProvides(currentInstance.parent)
          }
          // Extract provides from the current instance and merge them
          if (currentInstance.provides) {
            Object.assign(provides, currentInstance.provides)
          }
        }

        // Start the recursion from the initial instance
        if (instance?.parent && props.enableProvideBridge) {
          mergeProvides(instance.parent)

          Reflect.ownKeys(provides)
            .forEach((key) => {
              provide(key, provides[key])
            })
        }

        provide(CONTEXT_INJECTION_KEY, ctxValue)
        provide('extend', extend)

        if (typeof window !== 'undefined' && ctx?.app) {
          registerTresDevtools(ctx?.app, ctxValue)
        }
        return () => h(Fragment, null, !empty ? slots.default?.() : [])
      },
    })

  const mountCustomRenderer = (ctxValue: TresContext, empty = false) => {
    const InternalComponent = createInternalComponent(ctxValue, empty)
    const { render } = createRenderer(nodeOps(ctxValue))
    render(h(InternalComponent), context.value.scene.value as unknown as TresObject)
  }

  const dispose = (ctxValue: TresContext, force = false) => {
    disposeObject3D(ctxValue.scene.value as unknown as TresObject)
    if (force) {
      ctxValue.renderer.instance.dispose()
      if (ctxValue.renderer.instance instanceof WebGLRenderer) {
        ctxValue.renderer.instance.renderLists.dispose()
        ctxValue.renderer.instance.forceContextLoss()
      }
    }
    (context.value.scene.value as TresScene).__tres = {
      root: ctxValue,
    }
  }

  const handleHMR = (context: TresContext) => {
    dispose(context)
    mountCustomRenderer(context)
  }

  const unmountCanvas = () => {
    dispose(context.value)
    mountCustomRenderer(context.value, true)
  }

  const { camera, renderer } = context.value
  const { registerCamera, cameras, activeCamera, deregisterCamera } = camera

  mountCustomRenderer(context.value)

  const addDefaultCamera = () => {
    const camera = new PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    )
    camera.position.set(3, 3, 3)
    camera.lookAt(0, 0, 0)
    registerCamera(camera)

    const unwatch = watchEffect(() => {
      if (cameras.value.length >= 2) {
        camera.removeFromParent()
        deregisterCamera(camera)
        unwatch?.()
      }
    })
  }

  context.value.events.onPointerMissed((event) => {
    emit('pointermissed', event)
  })

  watch(
    () => props.camera,
    (newCamera, oldCamera) => {
      if (newCamera) {
        registerCamera(toValue(newCamera), true)
      }
      if (oldCamera) {
        toValue(oldCamera).removeFromParent()
        deregisterCamera(toValue(oldCamera))
      }
    },
    {
      immediate: true,
    },
  )

  if (!activeCamera.value) {
    addDefaultCamera()
  }

  renderer.onRender(() => {
    emit('render', context.value)
  })

  renderer.loop.onLoop((loopContext) => {
    emit('loop', { ...context.value, ...loopContext })
  })

  renderer.loop.onBeforeLoop((loopContext) => {
    emit('beforeLoop', { ...context.value, ...loopContext })
  })

  renderer.onReady(() => {
    emit('ready', context.value)
  })

  // HMR support
  if (import.meta.hot) {
    import.meta.hot.on('vite:afterUpdate', () => handleHMR(context.value))
  }

  // warn if the canvas has no area
  onMounted(async () => {
    await promiseTimeout(3000)

    if (!context.value.sizes.width || !context.value.sizes.height.value) {
      const windowSizePropName: keyof Pick<TresCanvasProps, 'windowSize'> = 'windowSize'
      console.warn(`TresCanvas: The canvas has no area, so nothing can be rendered. Set it manually on the parent element or use the prop ${windowSizePropName}.`)
    }
  })

  onUnmounted(unmountCanvas)

  return { dispose }
}
