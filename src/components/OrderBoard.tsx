import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { GripVertical, LoaderCircle } from 'lucide-react'
import { Badge, Button, EmptyState, cn } from './ui'
import { formatCurrency, formatDate, fromNow, statusLabels } from '../lib/format'
import { businessDate } from '../lib/dashboard'
import { orderBalance } from '../lib/operations'
import { workflowColumns, workflowMoveError, workflowTargets } from '../lib/order-workflow'
import type { Order, OrderStatus, Payment } from '../types'

const columnCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code) || !context.collisionRect) return
  event.preventDefault()
  const origin = workflowColumns.indexOf((context.over?.id ?? context.active?.data.current?.status) as OrderStatus)
  const right = ['ArrowRight', 'ArrowDown'].includes(event.code)
  const targets = context.droppableContainers.getEnabled()
    .filter(item => right ? workflowColumns.indexOf(item.id as OrderStatus) > origin : workflowColumns.indexOf(item.id as OrderStatus) < origin)
    .sort((a, b) => right ? workflowColumns.indexOf(a.id as OrderStatus) - workflowColumns.indexOf(b.id as OrderStatus) : workflowColumns.indexOf(b.id as OrderStatus) - workflowColumns.indexOf(a.id as OrderStatus))
  const rect = targets[0] && context.droppableRects.get(targets[0].id)
  if (rect) return { x: rect.left + (rect.width - context.collisionRect.width) / 2, y: rect.top + 55 }
}

interface BoardProps {
  orders: Order[]
  payments: Payment[]
  onOpen(order: Order): void
  onMove?(order: Order, status: OrderStatus): void | Promise<void>
  disabled?: boolean
}

export function OrderBoard({ orders, payments, onOpen, onMove, disabled = false }: BoardProps) {
  const [limits, setLimits] = useState<Partial<Record<OrderStatus, number>>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const moving = useRef(false)
  const active = orders.find(order => order.id === activeId)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates })
  )
  const locked = disabled || Boolean(savingId) || !onMove
  const move = async (order: Order, target: OrderStatus) => {
    if (locked || moving.current || !onMove) return
    const error = workflowMoveError(order, target)
    if (error) { setNotice(error); return }
    moving.current = true
    setSavingId(order.id)
    setNotice(target === 'completed' || target === 'cancelled' ? 'Review the order before confirming this change.' : `Saving ${order.order_number}…`)
    try { await onMove(order, target); setNotice('') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not move this order. Please try again.') }
    finally { moving.current = false; setSavingId(null) }
  }
  const drop = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null)
    const order = orders.find(item => item.id === dragged.id)
    const target = workflowColumns.find(status => status === over?.id)
    if (order && target && target !== order.status) void move(order, target)
  }
  return <>
    <p className="ops-board-help">Drag the grip to move an order. On touch, drag from the grip; or use “Move to” on the card. Completion and cancellation ask for review.</p>
    <p className="ops-board-notice" role="status">{notice || (disabled ? 'Stage changes are unavailable while offline or another action is saving.' : '')}</p>
    <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)}
      accessibility={{ screenReaderInstructions: { draggable: 'Press Space to pick up an order. Use arrow keys to move between available stages. Press Space to drop, or Escape to cancel. You can also use the Move to menu.' } }}
      onDragStart={({ active: dragged }) => { setActiveId(String(dragged.id)); setNotice('') }} onDragCancel={() => setActiveId(null)} onDragEnd={drop}>
      <div className="ops-board" aria-label="Order workflow board">{workflowColumns.map(status => {
        const rows = orders.filter(order => order.status === status), limit = limits[status] ?? 10
        return <BoardColumn key={status} status={status} count={rows.length} active={active}>
          {rows.length ? rows.slice(0, limit).map(order => <BoardOrder key={order.id} order={order} payments={payments} onOpen={onOpen} onMove={target => void move(order, target)} disabled={locked} saving={savingId === order.id} />)
            : <EmptyState title="Clear" description="No orders in this stage." />}
          {rows.length > limit && <Button variant="ghost" onClick={() => setLimits(current => ({ ...current, [status]: limit + 20 }))}>Show {Math.min(rows.length - limit, 20)} more</Button>}
        </BoardColumn>
      })}</div>
      {createPortal(<DragOverlay dropAnimation={null}>{active ? <div className="ops-board-order ops-board-preview"><span>{active.order_number}<b>{formatCurrency(active.price)}</b></span><h3>{active.track_name}</h3><p>{active.customer?.name ?? 'Customer'}</p><small>Drop into an available stage</small></div> : null}</DragOverlay>, document.body)}
    </DndContext>
  </>
}

function BoardColumn({ status, count, active, children }: { status: OrderStatus; count: number; active?: Order; children: ReactNode }) {
  const allowed = !active || active.status === status || !workflowMoveError(active, status)
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !allowed })
  return <section ref={setNodeRef} className={cn('ops-board-column', active && allowed && active.status !== status && 'ops-board-available', active && !allowed && 'ops-board-unavailable', isOver && active?.status !== status && 'ops-board-over')} aria-label={`${statusLabels[status]} orders`}>
    <header><h2>{statusLabels[status]}</h2><Badge>{count}</Badge></header>
    {active && <p className="ops-board-drop-hint">{active.status === status ? 'Current stage' : allowed ? status === 'completed' || status === 'cancelled' ? 'Drop to review' : 'Drop to move here' : workflowMoveError(active, status)}</p>}
    <div>{children}</div>
  </section>
}

function BoardOrder({ order, payments, onOpen, onMove, disabled, saving }: { order: Order; payments: Payment[]; onOpen(order: Order): void; onMove(status: OrderStatus): void; disabled: boolean; saving: boolean }) {
  const targets = workflowTargets(order)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: order.id, data: { status: order.status }, disabled: disabled || !targets.length })
  const balance = orderBalance(order, payments)
  const overdue = order.due_date && order.due_date < businessDate(new Date()) && !['delivered', 'cancelled'].includes(order.status)
  return <article ref={setNodeRef} className={cn('ops-board-card', isDragging && 'ops-board-dragging')} aria-busy={saving}>
    <button className="ops-board-order" onClick={() => onOpen(order)}><span>{order.order_number}<b>{formatCurrency(order.price)}</b></span><h3>{order.track_name}</h3><p>{order.customer?.name ?? 'Customer'} · {order.service?.code}</p><div><Badge tone={balance.review ? 'yellow' : balance.balance === 0 ? 'green' : 'blue'}>{balance.label}</Badge>{order.revision_requested && <Badge tone="yellow">Revision</Badge>}</div><small className={overdue ? 'ops-overdue' : ''}>{order.due_date ? `Due ${formatDate(order.due_date)}${overdue ? ' · overdue' : ''}` : 'No due date'}</small><small>{order.assignee?.full_name ?? 'Unassigned'} · Created {fromNow(order.created_at)}</small></button>
    {targets.length > 0 && <div className="ops-board-card-actions">
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Drag ${order.order_number}`} title="Drag to another stage" className="ops-board-grip" disabled={disabled}>{saving ? <LoaderCircle size={18} className="animate-spin" /> : <GripVertical size={18} />}</button>
      <select aria-label={`Move ${order.order_number} to`} disabled={disabled} value="" onChange={event => onMove(event.target.value as OrderStatus)}><option value="">{saving ? 'Saving…' : 'Move to…'}</option>{targets.map(target => <option value={target} key={target}>{statusLabels[target]}{target === 'completed' || target === 'cancelled' ? ' · review' : ''}</option>)}</select>
    </div>}
  </article>
}
