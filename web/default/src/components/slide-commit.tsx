import { ArrowRight, Check, LoaderCircle } from 'lucide-react'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

// Adapted from the SlideCommit component supplied for SnowAPI checkout.
// Keep the stretching capsule and spring return, with responsive geometry and
// cancellation that can never confirm a financial transaction.
export function SlideCommit(props: {
  disabled?: boolean
  onConfirm: () => Promise<void>
  onDone: () => void
  awaitingConfirmation?: boolean
}) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const track = useRef<HTMLDivElement>(null)
  const grip = useRef<{ id: number; start: number; initial: number } | null>(
    null
  )
  const running = useRef(false)
  const generation = useRef(0)
  const [width, setWidth] = useState(280)
  const [phase, setPhase] = useState<'idle' | 'pending' | 'done' | 'error'>(
    'idle'
  )
  const [held, setHeld] = useState(false)
  const x = useMotionValue(0)
  const anchor = useMotionValue(0)
  const shake = useMotionValue(0)
  const travel = Math.max(1, width - 56)
  const edge = useTransform(
    [x, anchor],
    ([position, end]: number[]) => Math.max(position, end) + 48
  )
  const clip = useTransform(
    edge,
    (right) => `inset(0 ${Math.max(0, width - 8 - right)}px 0 0 round 24px)`
  )
  const content = useTransform(
    [x, edge],
    ([position, right]: number[]) => (position + right - (width - 8)) / 2
  )
  const labelOpacity = useTransform(x, [0, travel * 0.55], [1, 0])
  const spring = {
    type: 'spring' as const,
    stiffness: 550,
    damping: 38,
    mass: 0.9,
  }

  useEffect(() => {
    const node = track.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width)
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      generation.current += 1
    }
  }, [])

  const home = () => {
    if (reduce) x.set(0)
    else void animate(x, 0, { ...spring, damping: 24 })
  }

  const commit = async () => {
    if (props.disabled || running.current) return
    running.current = true
    const current = generation.current
    setPhase('pending')
    x.set(travel)
    try {
      await props.onConfirm()
      if (current !== generation.current) return
      anchor.set(travel)
      setPhase('done')
      if (reduce) x.set(0)
      else void animate(x, 0, spring)
      props.onDone()
    } catch {
      if (current !== generation.current) return
      setPhase('error')
      running.current = false
      anchor.set(0)
      home()
      if (!reduce) {
        void animate(shake, [0, -5, 5, -3, 3, -1, 0], { duration: 0.4 })
      }
    }
  }

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (props.disabled || running.current || event.button !== 0) return
    x.stop()
    setPhase('idle')
    grip.current = {
      id: event.pointerId,
      start: event.clientX,
      initial: x.get(),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setHeld(true)
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!grip.current || grip.current.id !== event.pointerId) return
    const scale =
      (track.current?.getBoundingClientRect().width ?? width) / width
    x.set(
      Math.max(
        0,
        Math.min(
          travel,
          grip.current.initial + (event.clientX - grip.current.start) / scale
        )
      )
    )
  }

  const release = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (grip.current?.id !== event.pointerId) return
    grip.current = null
    setHeld(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!cancelled && x.get() >= travel - 1) void commit()
    else home()
  }

  const keyDown = (event: KeyboardEvent) => {
    if (props.disabled || running.current) return
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'End') {
      event.preventDefault()
      void commit()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      x.set(Math.min(travel, x.get() + travel / 10))
      if (x.get() >= travel - 1) void commit()
    } else if (event.key === 'Home' || event.key === 'ArrowLeft') {
      event.preventDefault()
      home()
    }
  }

  return (
    <motion.div
      ref={track}
      className='snowapi-slide-commit'
      data-phase={phase}
      data-held={held || undefined}
      data-disabled={props.disabled || undefined}
      style={{ x: shake }}
    >
      <motion.span
        className='snowapi-slide-label'
        style={{ opacity: labelOpacity }}
        aria-hidden='true'
      >
        {phase === 'error' && !props.awaitingConfirmation
          ? t('Payment failed')
          : t('Slide to pay')}
      </motion.span>
      <motion.div
        role='button'
        tabIndex={props.disabled ? -1 : 0}
        aria-label={t('Slide to pay')}
        aria-disabled={props.disabled || running.current}
        aria-busy={phase === 'pending'}
        className='snowapi-slide-capsule'
        style={{ clipPath: clip }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(event) => release(event)}
        onPointerCancel={(event) => release(event, true)}
        onLostPointerCapture={(event) => release(event, true)}
        onKeyDown={keyDown}
      >
        <motion.span className='snowapi-slide-content' style={{ x: content }}>
          {phase === 'pending' && (
            <LoaderCircle
              className='snowapi-checkout-spinner'
              aria-hidden='true'
            />
          )}
          {phase === 'done' && (
            <>
              <Check aria-hidden='true' />
              {t('Paid')}
            </>
          )}
          {(phase === 'idle' || phase === 'error') && (
            <ArrowRight aria-hidden='true' />
          )}
        </motion.span>
      </motion.div>
      <span className='sr-only' role='status'>
        {phase === 'pending' && t('Processing payment…')}
        {phase === 'done' && t('Paid')}
      </span>
    </motion.div>
  )
}
