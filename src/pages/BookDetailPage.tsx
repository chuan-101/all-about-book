import { Link, useParams } from 'react-router-dom'
import { useBooks } from '../lib/books-context'

const statusLabels = {
  unread: '未读',
  reading: '在读',
  finished: '已读完',
  paused: '暂停',
} as const

function BookDetailPage() {
  const { bookId } = useParams()
  const { getById } = useBooks()
  const book = bookId ? getById(bookId) : undefined

  if (!book) {
    return (
      <section className="stack">
        <h2>未找到此书</h2>
        <p className="muted">
          无法找到这本书，请返回书架选择其他标题。
        </p>
        <Link className="button primary" to="/books">
          返回书架
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">书籍详情</p>
          <h2>{book.title}</h2>
          <p className="muted">{book.author || '作者未知'}</p>
        </div>
        <Link className="button ghost" to="/books">
          返回书架
        </Link>
      </div>

      <div className="detail-grid">
        <div className="card detail-cover">
          {book.cover ? (
            <img src={book.cover} alt={`${book.title} cover`} />
          ) : (
            <div className="cover placeholder large">暂无封面</div>
          )}
        </div>
        <div className="card detail-info">
          <div className="info-row">
            <span>状态</span>
            <strong>{statusLabels[book.status]}</strong>
          </div>
          <div className="info-row">
            <span>类型</span>
            <strong>{book.genre || '未设置'}</strong>
          </div>
          <div className="info-row">
            <span>译者</span>
            <strong>{book.translator || '未设置'}</strong>
          </div>
          {book.startDate ? (
            <div className="info-row">
              <span>开始日期</span>
              <strong>{book.startDate}</strong>
            </div>
          ) : null}
          {book.endDate ? (
            <div className="info-row">
              <span>结束日期</span>
              <strong>{book.endDate}</strong>
            </div>
          ) : null}
          {book.rating ? (
            <div className="info-row">
              <span>评分</span>
              <strong>{book.rating}</strong>
            </div>
          ) : null}
          <div className="info-row">
            <span>创建时间</span>
            <strong>{new Date(book.createdAt).toLocaleString()}</strong>
          </div>
          <div className="info-row">
            <span>更新时间</span>
            <strong>{new Date(book.updatedAt).toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {book.notes ? (
        <div className="card stack">
          <h3>笔记</h3>
          <p>{book.notes}</p>
        </div>
      ) : null}

      <div className="card stack">
        <h3>阅读打卡</h3>
        <p className="muted">即将上线：记录阅读进度和笔记。</p>
      </div>
      <div className="card stack">
        <h3>书摘</h3>
        <p className="muted">即将上线：保存精彩段落。</p>
      </div>
      <div className="card stack">
        <h3>读后感</h3>
        <p className="muted">即将上线：总结和评分。</p>
      </div>
    </section>
  )
}

export default BookDetailPage
