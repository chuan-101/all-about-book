import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from 'react'

type AutoResizeTextareaProps =
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    maxHeight?: number | string
  }

const AutoResizeTextarea = forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(({ maxHeight = 240, style, value, ...props }, forwardedRef) => {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)

  useImperativeHandle(
    forwardedRef,
    () => innerRef.current as HTMLTextAreaElement,
  )

  useLayoutEffect(() => {
    const element = innerRef.current
    if (!element) return

    const resize = () => {
      element.style.height = 'auto'
      const computedMax = Number.parseFloat(
        getComputedStyle(element).maxHeight,
      )
      const max =
        Number.isFinite(computedMax) && computedMax > 0
          ? computedMax
          : element.scrollHeight
      const nextHeight = Math.min(element.scrollHeight, max)
      element.style.height = `${nextHeight}px`
      element.style.overflowY =
        element.scrollHeight > max ? 'auto' : 'hidden'
    }

    const frame = requestAnimationFrame(resize)
    return () => cancelAnimationFrame(frame)
  }, [value, maxHeight])

  return (
    <textarea
      ref={innerRef}
      value={value}
      {...props}
      style={{
        ...style,
        maxHeight:
          typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
      }}
    />
  )
})

AutoResizeTextarea.displayName = 'AutoResizeTextarea'

export default AutoResizeTextarea
