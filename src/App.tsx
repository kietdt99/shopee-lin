import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, LogOut, Package, Plus, ReceiptText, Smartphone } from 'lucide-react'
import { formatDate, formatVnd } from './lib/format'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { InstallmentPlan, Order, Payment, Profile } from './types'

type Tab = 'overview' | 'orders' | 'installments'

const payeeName = import.meta.env.VITE_PAYEE_NAME ?? ''
const payeeAccount = import.meta.env.VITE_PAYEE_ACCOUNT ?? ''
const payeeBank = import.meta.env.VITE_PAYEE_BANK ?? 'TPB'
const paymentQrUrl = payeeName && payeeAccount
  ? `https://img.vietqr.io/image/${payeeBank}-${payeeAccount}-compact2.png?accountName=${encodeURIComponent(payeeName)}`
  : ''
const today = new Date().toISOString().slice(0, 10)

export default function App() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [plans, setPlans] = useState<InstallmentPlan[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [showPayCard, setShowPayCard] = useState(false)

  const client = supabase
  const isAdmin = profile?.role === 'admin'

  const outstanding = useMemo(
    () => orders.filter((order) => order.status === 'unpaid').reduce((total, order) => total + order.amount, 0),
    [orders],
  )
  const paidThisList = useMemo(
    () => payments.reduce((total, payment) => total + payment.amount, 0),
    [payments],
  )

  const loadData = async () => {
    if (!client) return
    const { data: sessionData } = await client.auth.getSession()
    const user = sessionData.session?.user
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }

    const [profileResult, orderResult, paymentResult, planResult] = await Promise.all([
      client.from('profiles').select('id,email,full_name,role').eq('id', user.id).single(),
      client.from('orders').select('id,placed_at,description,amount,status,billing_cycle_id').order('placed_at', { ascending: false }),
      client.from('payments').select('id,paid_at,amount,note').order('paid_at', { ascending: false }),
      client.from('installment_summary').select('id,name,total_amount,total_paid'),
    ])

    if (profileResult.error) {
      setMessage('Tài khoản này chưa được cấp quyền. Hãy liên hệ bé Kịt.')
      setProfile(null)
    } else {
      setProfile(profileResult.data as Profile)
      setOrders((orderResult.data ?? []) as Order[])
      setPayments((paymentResult.data ?? []) as Payment[])
      setPlans((planResult.data ?? []) as InstallmentPlan[])
      setMessage('')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!client) {
      setLoading(false)
      return
    }
    void loadData()
    const { data } = client.auth.onAuthStateChange(() => void loadData())
    return () => data.subscription.unsubscribe()
  }, [])

  const sendMagicLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!client) return
    setMessage('Đang gửi link đăng nhập…')
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    setMessage(error ? error.message : 'Đã gửi link đăng nhập. Hãy kiểm tra email nhé.')
  }

  const signOut = async () => {
    await client?.auth.signOut()
    setProfile(null)
    setOrders([])
  }

  if (!isSupabaseConfigured) return <ConfigurationNotice />
  if (loading) return <main className="centered"><p>Đang mở sổ nợ của Bé Lin…</p></main>
  if (!profile) return <Login email={email} message={message} onEmailChange={setEmail} onSubmit={sendMagicLink} />

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Sổ chi tiêu</p>
          <h1>Bé Lin</h1>
        </div>
        <div className="profile-chip">
          <span>{profile.full_name}</span>
          <button className="icon-button" onClick={() => void signOut()} aria-label="Đăng xuất"><LogOut size={18} /></button>
        </div>
      </header>

      <nav className="tabs" aria-label="Điều hướng">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<ReceiptText size={18} />} label="Tổng quan" />
        <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} icon={<Package size={18} />} label="Đơn hàng" />
        <TabButton active={tab === 'installments'} onClick={() => setTab('installments')} icon={<CreditCard size={18} />} label="Trả góp" />
      </nav>

      {tab === 'overview' && <Overview outstanding={outstanding} paid={paidThisList} plans={plans} isAdmin={isAdmin} onPay={() => setShowPayCard(true)} />}
      {tab === 'orders' && <OrdersPanel orders={orders} isAdmin={isAdmin} onUpdated={loadData} />}
      {tab === 'installments' && <InstallmentsPanel plans={plans} isAdmin={isAdmin} onUpdated={loadData} />}

      {showPayCard && <PaymentCard onClose={() => setShowPayCard(false)} />}
    </main>
  )
}

function ConfigurationNotice() {
  return <main className="centered"><section className="auth-card"><h1>Cần cấu hình Supabase</h1><p>Thêm Project URL và Publishable key vào file <code>.env.local</code> để chạy ứng dụng.</p></section></main>
}

function Login({ email, message, onEmailChange, onSubmit }: { email: string; message: string; onEmailChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <main className="centered"><section className="auth-card"><p className="eyebrow">Sổ chi tiêu</p><h1>Bé Lin</h1><p>Đăng nhập bằng email đã được cấp quyền.</p><form onSubmit={onSubmit}><label>Email<input required type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="email@example.com" /></label><button className="primary-button" type="submit">Gửi link đăng nhập</button></form>{message && <p className="form-message">{message}</p>}</section></main>
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}

function Overview({ outstanding, paid, plans, isAdmin, onPay }: { outstanding: number; paid: number; plans: InstallmentPlan[]; isAdmin: boolean; onPay: () => void }) {
  const installmentRemaining = plans.reduce((total, plan) => total + plan.total_amount - plan.total_paid, 0)
  return <section className="content-stack">
    <section className="balance-card"><p>Dư nợ Shopee hiện tại</p><strong>{formatVnd(outstanding)}</strong><span>Cập nhật từ các đơn chưa thanh toán</span>{!isAdmin && <button className="light-button" onClick={onPay}><Smartphone size={18} />Thanh toán</button>}</section>
    <section className="metric-grid"><article className="metric"><span>Đã ghi nhận trả</span><strong>{formatVnd(paid)}</strong></article><article className="metric"><span>Còn trả góp</span><strong>{formatVnd(installmentRemaining)}</strong></article></section>
    <section className="section-card"><div className="section-heading"><div><p className="eyebrow">Kỳ hiện tại</p><h2>21/10/2026 — 20/11/2026</h2></div>{isAdmin && <span className="status-pill">Admin</span>}</div><p>{isAdmin ? 'Thêm đơn hàng hoặc ghi nhận khoản Bé Lin đã trả ở tab Đơn hàng.' : 'Theo dõi các đơn chưa trả và dùng QR khi cần thanh toán.'}</p></section>
  </section>
}

function OrdersPanel({ orders, isAdmin, onUpdated }: { orders: Order[]; isAdmin: boolean; onUpdated: () => Promise<void> }) {
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const unpaid = orders.filter((order) => order.status === 'unpaid')
  const selectedOrders = unpaid.filter((order) => selected.includes(order.id))
  const selectedAmount = selectedOrders.reduce((total, order) => total + order.amount, 0)

  const toggleOrder = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const markPaid = async () => {
    if (!supabase || selectedOrders.length === 0) return
    setBusy(true)
    const { error } = await supabase.rpc('record_full_order_payment', {
      p_order_ids: selected,
      p_paid_at: today,
      p_note: 'Admin xác nhận thanh toán',
    })
    if (error) window.alert(error.message)
    else setSelected([])
    setBusy(false)
    await onUpdated()
  }

  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Shopee</p><h2>Đơn hàng</h2></div>{isAdmin && <button className="primary-button compact" onClick={() => setShowNew(true)}><Plus size={18} />Thêm đơn</button>}</div>
    {isAdmin && selected.length > 0 && <section className="selection-bar"><span>Đã chọn {selected.length} đơn · {formatVnd(selectedAmount)}</span><button className="primary-button compact" disabled={busy} onClick={() => void markPaid()}><CheckCircle2 size={17} />Đánh dấu đã trả</button></section>}
    <section className="list-card">{orders.length === 0 ? <p className="empty-state">Chưa có đơn nào. Dữ liệu Excel sẽ được import ở bước tiếp theo.</p> : orders.map((order) => <article className="order-row" key={order.id}>{isAdmin && order.status === 'unpaid' && <input aria-label={`Chọn ${order.description}`} type="checkbox" checked={selected.includes(order.id)} onChange={() => toggleOrder(order.id)} />}<div className="order-details"><strong>{order.description}</strong><span>{formatDate(order.placed_at)}</span></div><div className="order-total"><strong>{formatVnd(order.amount)}</strong><span className={`order-status ${order.status}`}>{order.status === 'unpaid' ? 'Chưa trả' : order.status === 'paid' ? 'Đã trả' : 'Đã hủy'}</span></div></article>)}</section>
    {showNew && <NewOrderDialog onClose={() => setShowNew(false)} onSaved={onUpdated} />}</section>
}

function NewOrderDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [placedAt, setPlacedAt] = useState(today)
  const [error, setError] = useState('')
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const vnd = Number(amount.replace(/,/g, ''))
    if (!supabase || !Number.isInteger(vnd) || vnd <= 0) return setError('Nhập số tiền VND hợp lệ.')
    const result = await supabase.from('orders').insert({ description, amount: vnd, placed_at: placedAt })
    if (result.error) return setError(result.error.message)
    await onSaved(); onClose()
  }
  return <Dialog title="Thêm đơn hàng" onClose={onClose}><form className="form-stack" onSubmit={save}><label>Mô tả đơn<input required value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Ngày đặt<input required type="date" value={placedAt} onChange={(event) => setPlacedAt(event.target.value)} /></label><label>Số tiền (VND)<input required inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{error && <p className="form-message">{error}</p>}<button className="primary-button" type="submit">Lưu đơn hàng</button></form></Dialog>
}

function InstallmentsPanel({ plans, isAdmin, onUpdated }: { plans: InstallmentPlan[]; isAdmin: boolean; onUpdated: () => Promise<void> }) {
  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Khoản riêng</p><h2>Trả góp</h2></div></div><section className="list-card">{plans.length === 0 ? <p className="empty-state">Chưa có khoản trả góp. Sheet Góp S25U sẽ được import thành một khoản riêng.</p> : plans.map((plan) => { const remaining = plan.total_amount - plan.total_paid; const progress = Math.min(100, Math.round((plan.total_paid / plan.total_amount) * 100)); return <article className="installment-row" key={plan.id}><div><strong>{plan.name}</strong><span>Đã góp {formatVnd(plan.total_paid)} / {formatVnd(plan.total_amount)}</span><div className="progress"><i style={{ width: `${progress}%` }} /></div></div><strong>{formatVnd(remaining)}<small>còn lại</small></strong></article>})}</section>{isAdmin && <p className="hint">Admin sẽ có thể ghi thêm lần góp sau khi hoàn tất import dữ liệu lịch sử.</p>}</section>
}

function PaymentCard({ onClose }: { onClose: () => void }) {
  return <Dialog title="Thanh toán" onClose={onClose}><div className="payment-card">{paymentQrUrl ? <img src={paymentQrUrl} alt="Mã VietQR thanh toán" /> : <p className="form-message">QR chưa được cấu hình.</p>}<strong>{payeeName || 'Chưa cấu hình tên người nhận'}</strong><span>{payeeBank} · {payeeAccount || 'Chưa cấu hình số tài khoản'}</span><p className="payment-note">Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé.</p></div></Dialog>
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="dialog-heading"><h2>{title}</h2><button className="text-button" onClick={onClose}>Đóng</button></div>{children}</section></div>
}
