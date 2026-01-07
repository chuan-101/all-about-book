import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useState } from 'react'
import type { Book, BookStatus } from '../types/book'

export type BookFormValues = {
  title: string
  author: string
  translator: string
  genre: string
  status: BookStatus
  cover: string
  startDate: string
  endDate: string
  rating: string
  notes: string
}

type BookFormProps = {
  initialValues?: Partial<Book>
  onSubmit: (values: BookFormValues) => void
  onCancel?: () => void
  submitLabel?: string
}

const statusOptions: BookStatus[] = ['unread', 'reading', 'paused', 'finished']
const statusLabels: Record<BookStatus, string> = {
  unread: '未读',
  reading: '在读',
  finished: '已读完',
  paused: '暂停',
}

function BookForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = '保存',
}: BookFormProps) {
  const [values, setValues] = useState<BookFormValues>({
    title: initialValues?.title ?? '',
    author: initialValues?.author ?? '',
    translator: initialValues?.translator ?? '',
    genre: initialValues?.genre ?? '',
    status: initialValues?.status ?? 'unread',
    cover: initialValues?.cover ?? '',
    startDate: initialValues?.startDate ?? '',
    endDate: initialValues?.endDate ?? '',
    rating:
      initialValues?.rating !== undefined
        ? String(initialValues.rating)
        : '',
    notes: initialValues?.notes ?? '',
  })

  useEffect(() => {
    setValues({
      title: initialValues?.title ?? '',
      author: initialValues?.author ?? '',
      translator: initialValues?.translator ?? '',
      genre: initialValues?.genre ?? '',
      status: initialValues?.status ?? 'unread',
      cover: initialValues?.cover ?? '',
      startDate: initialValues?.startDate ?? '',
      endDate: initialValues?.endDate ?? '',
      rating:
        initialValues?.rating !== undefined
          ? String(initialValues.rating)
          : '',
      notes: initialValues?.notes ?? '',
    })
  }, [initialValues])

  const handleChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(values)
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label className="field">
          <span>书名 *</span>
          <input
            name="title"
            value={values.title}
            onChange={handleChange}
            required
          />
        </label>
        <label className="field">
          <span>作者</span>
          <input name="author" value={values.author} onChange={handleChange} />
        </label>
        <label className="field">
          <span>译者</span>
          <input
            name="translator"
            value={values.translator}
            onChange={handleChange}
          />
        </label>
        <label className="field">
          <span>类型</span>
          <input name="genre" value={values.genre} onChange={handleChange} />
        </label>
        <label className="field">
          <span>状态</span>
          <select name="status" value={values.status} onChange={handleChange}>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {statusLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>封面链接</span>
          <input
            name="cover"
            value={values.cover}
            onChange={handleChange}
            placeholder="https://..."
          />
        </label>
        <label className="field">
          <span>开始日期</span>
          <input
            type="date"
            name="startDate"
            value={values.startDate}
            onChange={handleChange}
          />
        </label>
        <label className="field">
          <span>结束日期</span>
          <input
            type="date"
            name="endDate"
            value={values.endDate}
            onChange={handleChange}
          />
        </label>
        <label className="field">
          <span>评分</span>
          <select name="rating" value={values.rating} onChange={handleChange}>
            <option value="">未评分</option>
            {Array.from({ length: 5 }, (_, index) => {
              const value = String(index + 1)
              return (
                <option key={value} value={value}>
                  {value}
                </option>
              )
            })}
          </select>
        </label>
      </div>
      <label className="field">
        <span>笔记</span>
        <textarea
          name="notes"
          rows={4}
          value={values.notes}
          onChange={handleChange}
          placeholder="写下读书笔记或想法"
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="button primary">
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="button ghost" onClick={onCancel}>
            取消
          </button>
        ) : null}
      </div>
    </form>
  )
}

export default BookForm
