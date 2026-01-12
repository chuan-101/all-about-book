import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

type UpdateHandler = (reloadPage?: boolean) => Promise<void>

function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updateServiceWorker, setUpdateServiceWorker] =
    useState<UpdateHandler | null>(null)

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true)
      },
    })

    setUpdateServiceWorker(() => updateSW)
  }, [])

  if (!needRefresh) {
    return null
  }

  return (
    <div className="notice info update">
      <span>有新版本可用。</span>
      <button
        type="button"
        className="button ghost"
        onClick={() => updateServiceWorker?.(true)}
      >
        刷新以更新
      </button>
    </div>
  )
}

export default UpdatePrompt
