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
>(({ maxHeight = '40vh', style, value, ...props }, forwardedRef) => {
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
      // 以渲染后的实际可视高度判断能否放下全部内容：弹窗限高、flex 压缩、
      // 移动端键盘弹起等都会让盒子小于内容高度，此时必须允许内部滚动，
      // 否则手机上超出部分完全够不到（只比较 maxHeight 会漏掉这些情况）。
      element.style.overflowY =
        element.scrollHeight > element.clientHeight + 2 ? 'auto' : 'hidden'
    }

    const frame = requestAnimationFrame(resize)
    const handleViewportResize = () => resize()
    window.addEventListener('resize', handleViewportResize)
    window.visualViewport?.addEventListener('resize', handleViewportResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleViewportResize)
      window.visualViewport?.removeEventListener(
        'resize',
        handleViewportResize,
      )
    }
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
