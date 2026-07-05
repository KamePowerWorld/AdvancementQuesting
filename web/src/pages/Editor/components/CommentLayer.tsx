import { commentsApi } from '@/api/comments.js'
import { CommentBlockEl, COMMENT_COLORS } from '@/components/editor/CommentBlockEl.js'
import type { EditorState } from '../hooks/useEditorState.js'

/** コメントブロック一覧とドラッグ作成中のドラフト矩形 */
export function CommentLayer({ s, isEditor }: { s: EditorState; isEditor: boolean }) {
  return (
    <>
      {s.comments.map(comment => (
        <CommentBlockEl key={comment.id} comment={comment} mode={s.mode} editable={isEditor}
          onMoveStart={(e) => {
            if ('button' in e && (e as React.MouseEvent).button !== 0) return
            e.stopPropagation()
            const rect = s.canvasRef.current?.getBoundingClientRect()
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
            const wx = (clientX - (rect?.left ?? 0) - s.panRef.current.x) / s.scaleRef.current
            const wy = (clientY - (rect?.top ?? 0) - s.panRef.current.y) / s.scaleRef.current
            const members = isEditor ? s.nodes.filter((n) => n.x >= comment.x && n.x <= comment.x + comment.width && n.y >= comment.y && n.y <= comment.y + comment.height).map((n) => ({ id: n.id, x: n.x, y: n.y })) : []
            s.commentDragRef.current = { offsetX: wx - comment.x, offsetY: wy - comment.y, startX: comment.x, startY: comment.y, members }
            s.setDraggingCommentId(comment.id)
          }}
          onResizeStart={(e, dir) => {
            e.stopPropagation()
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
            s.commentResizeStartRef.current = { mouseX: clientX, mouseY: clientY, origX: comment.x, origY: comment.y, origW: comment.width, origH: comment.height, dir }
            s.setResizingCommentId(comment.id)
          }}
          onDelete={() => { commentsApi.delete(comment.id).then(() => { s.setComments(prev => prev.filter(c => c.id !== comment.id)) }).catch(() => {}) }}
          onEdit={(updates) => {
            const updated = { ...comment, ...updates }
            commentsApi.update(comment.id, { x: updated.x, y: updated.y, width: updated.width, height: updated.height, title: updated.title, color: updated.color }).then(saved => { s.setComments(prev => prev.map(c => c.id === saved.id ? saved : c)) }).catch(() => {})
          }}
        />
      ))}

      {s.commentDraft && s.commentDraft.w > 5 && s.commentDraft.h > 5 && (
        <div className="absolute pointer-events-none" style={{ left: s.commentDraft.x, top: s.commentDraft.y, width: s.commentDraft.w, height: s.commentDraft.h, border: `2px dashed ${COMMENT_COLORS[0].hex}`, background: `${COMMENT_COLORS[0].hex}22`, borderRadius: 6, zIndex: 1 }} />
      )}
    </>
  )
}
