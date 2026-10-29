// drag and drop for reordering inside a list
// every drag has a button or keyboard alternative, this only adds the mouse/touch path
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'

interface DragData {
  listId: string
  index: number
  move: (from: number, to: number) => void
}

// only items of the same list are drop targets, prefer the innermost list when lists nest
const collision: CollisionDetection = (args) => {
  const active = args.active.data.current as DragData | undefined
  const containers = args.droppableContainers.filter(
    (c) => (c.data.current as DragData | undefined)?.listId === active?.listId,
  )
  const hits = pointerWithin({ ...args, droppableContainers: containers })
  if (hits.length) {
    const area = (id: string | number) => {
      const r = args.droppableRects.get(id)
      return r ? r.width * r.height : Infinity
    }
    return [...hits].sort((a, b) => area(a.id) - area(b.id)).slice(0, 1)
  }
  return args.pointerCoordinates ? [] : closestCenter({ ...args, droppableContainers: containers })
}

// arrow keys jump straight to the neighbouring card of the same list
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const data = args.context.active?.data.current as DragData | undefined
  if (!data) return sortableKeyboardCoordinates(event, args)
  const offset = event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0
  if (!offset) return
  event.preventDefault()
  const overData = args.context.over?.data.current as DragData | undefined
  const index = overData?.listId === data.listId ? overData.index : data.index
  const rect = args.context.droppableRects.get(`${data.listId}::${index + offset}`)
  if (rect) return { x: rect.left, y: rect.top }
}

export function DndProvider({ children }: { children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, scrollBehavior: 'auto' }),
  )
  const onEnd = (e: DragEndEvent) => {
    const a = e.active.data.current as DragData | undefined
    const o = e.over?.data.current as DragData | undefined
    if (!a || !o || a.listId !== o.listId || o.index === a.index) return
    a.move(a.index, o.index)
  }
  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={onEnd}>
      {children}
    </DndContext>
  )
}

interface SortableListProps {
  listId: string
  count: number
  children: ReactNode
  className?: string
}

export function SortableList({ listId, count, children, className = '' }: SortableListProps) {
  const ids = Array.from({ length: count }, (_, i) => `${listId}::${i}`)
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div className={`sortable-list ${className}`}>{children}</div>
    </SortableContext>
  )
}

interface SortableItemProps {
  listId: string
  index: number
  move: (from: number, to: number) => void
  children: (handle: { attributes: object; listeners: object | undefined; isDragging: boolean }) => ReactNode
}

export function SortableItem({ listId, index, move, children }: SortableItemProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `${listId}::${index}`,
    data: { listId, index, move } satisfies DragData,
  })
  return (
    <div
      ref={setNodeRef}
      className={'sortable-item' + (isDragging ? ' is-dragging' : '')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {children({ attributes, listeners, isDragging })}
    </div>
  )
}
