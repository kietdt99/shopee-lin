import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, LogOut, Package, Plus, ReceiptText, Smartphone, Pencil, Trash2 } from 'lucide-react'
import { formatDate, formatVnd } from './lib/format'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { InstallmentPlan, Order, Payment, Profile } from './types'

type Tab = 'overview' | 'orders' | 'installments' | 'reports'

const payeeName = import.meta.env.VITE_PAYEE_NAME ?? ''
const payeeAccount = import.meta.env.VITE_PAYEE_ACCOUNT ?? ''
const payeeBank = import.meta.env.VITE_PAYEE_BANK ?? 'TPB'
const paymentQrUrl = payeeName && payeeAccount
  ? `https://img.vietqr.io/image/${payeeBank}-${payeeAccount}-compact2.png?accountName=${encodeURIComponent(payeeName)}`
  : ''
const today = new Date().toISOString().slice(0, 10)
const cycleLabel = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1 + (day >= 21 ? 1 : 0), 1))
  return `${String(next.getUTCMonth() + 1).padStart(2, '0')}.${next.getUTCFullYear()}`
}
const cycleRange = (label: string) => {
  const [month, year] = label.split('.').map(Number)
  const start = new Date(Date.UTC(year, month - 2, 21))
  const end = new Date(Date.UTC(year, month - 1, 20))
  const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
  return { starts_on: iso(start), ends_on: iso(end) }
}

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
  const [cycles, setCycles] = useState<any[]>([])
  const [allocations, setAllocations] = useState<any[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([])
  const [closings, setClosings] = useState<any[]>([])
  const [reportCycle, setReportCycle] = useState('')
  const [installmentPayments, setInstallmentPayments] = useState<any[]>([])

  const client = supabase
  const isAdmin = profile?.role === 'admin'

  const outstanding = useMemo(
    () => Math.max(0, orders.filter((order) => order.status !== 'cancelled').reduce((total, order) => total + order.amount, 0) - allocations.reduce((total, allocation) => total + allocation.amount, 0) + ledgerEntries.reduce((total, entry) => total + entry.amount, 0)),
    [orders, allocations, ledgerEntries],
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

    const [profileResult, orderResult, paymentResult, planResult, cycleResult, installmentPaymentResult, allocationResult, ledgerResult, closingResult] = await Promise.all([
      client.from('profiles').select('id,email,full_name,role').eq('id', user.id).single(),
      client.from('orders').select('id,placed_at,description,amount,status,billing_cycle_id').order('placed_at', { ascending: false }),
      client.from('payments').select('id,paid_at,amount,note').order('paid_at', { ascending: false }),
      client.from('installment_summary').select('id,name,total_amount,total_paid'),
      client.from('billing_cycles').select('*').order('starts_on', { ascending: false }),
      client.from('installment_payments').select('*').order('paid_at', { ascending: false }),
      client.from('payment_allocations').select('payment_id,order_id,amount'),
      client.from('ledger_entries').select('*'),
      client.from('cycle_closings').select('*'),
    ])

    if (profileResult.error) {
      setMessage('Tài khoản này chưa được cấp quyền. Hãy liên hệ bé Kịt.')
      setProfile(null)
    } else {
      setProfile(profileResult.data as Profile)
      setOrders((orderResult.data ?? []) as Order[])
      setPayments((paymentResult.data ?? []) as Payment[])
      setPlans((planResult.data ?? []) as InstallmentPlan[])
      setCycles(cycleResult.data ?? [])
      setInstallmentPayments(installmentPaymentResult.data ?? [])
      setAllocations(allocationResult.data ?? [])
      setLedgerEntries(ledgerResult.data ?? [])
      setClosings(closingResult.data ?? [])
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
      options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`, shouldCreateUser: true },
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
        <TabButton active={tab === 'reports'} onClick={() => setTab('reports')} icon={<ReceiptText size={18} />} label="Báo cáo" />
      </nav>

      {tab === 'overview' && <Overview outstanding={outstanding} paid={paidThisList} plans={plans} isAdmin={isAdmin} onPay={() => setShowPayCard(true)} />}
      {tab === 'orders' && <OrdersPanel orders={orders} allocations={allocations} isAdmin={isAdmin} onUpdated={loadData} />}
      {tab === 'installments' && <InstallmentsPanel plans={plans} isAdmin={isAdmin} onUpdated={loadData} />}
      {tab === 'reports' && <ReportsPanel orders={orders} payments={payments} plans={plans} cycles={cycles} ledgerEntries={ledgerEntries} closings={closings} selected={reportCycle} onSelect={setReportCycle} onUpdated={loadData} isAdmin={isAdmin} />}

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
    <section className="section-card"><div className="section-heading"><div><p className="eyebrow">Kỳ hiện tại</p><h2>Kỳ {cycleLabel(today)}</h2></div>{isAdmin && <span className="status-pill">Admin</span>}</div><p>{isAdmin ? 'Thêm đơn hàng hoặc ghi nhận khoản Bé Lin đã trả ở tab Đơn hàng.' : 'Theo dõi các đơn chưa trả và dùng QR khi cần thanh toán.'}</p></section>
  </section>
}

function OrdersPanel({ orders, allocations, isAdmin, onUpdated }: { orders: Order[]; allocations: any[]; isAdmin: boolean; onUpdated: () => Promise<void> }) {
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const unpaid = orders.filter((order) => order.status === 'unpaid')
  const selectedOrders = unpaid.filter((order) => selected.includes(order.id))
  const remainingFor = (order: Order) => order.amount - allocations.filter(a => a.order_id === order.id).reduce((s,a)=>s+a.amount,0)
  const selectedAmount = selectedOrders.reduce((total, order) => total + remainingFor(order), 0)

  const toggleOrder = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const markPaid = async () => {
    if (!supabase || selectedOrders.length === 0) return
    const input = window.prompt(`Số tiền đã nhận (đơn đã chọn tối đa ${formatVnd(selectedAmount)}):`, String(selectedAmount))
    if (input === null) return
    const amount = Number(input.replace(/[^0-9]/g, ''))
    if (!Number.isSafeInteger(amount) || amount <= 0) return window.alert('Số tiền VND không hợp lệ.')
    setBusy(true)
    const { error } = await supabase.rpc('record_order_payment', {
      p_order_ids: selected,
      p_amount: amount,
      p_paid_at: today,
      p_note: 'Admin xác nhận thanh toán',
    })
    if (error) window.alert(error.message)
    else setSelected([])
    setBusy(false)
    await onUpdated()
  }
  const cancelOrder = async (order: Order) => {
    if (!supabase) return
    if (order.status === 'unpaid' && remainingFor(order) === order.amount) {
      if (!window.confirm(`Xóa đơn chưa thanh toán “${order.description}” khỏi sổ?`)) return
      const { error } = await supabase.from('orders').delete().eq('id', order.id)
      if (error) window.alert(error.message); else await onUpdated()
      return
    }
    if (!window.confirm(`Hủy đơn “${order.description}”?`)) return
    const refunded = order.status === 'paid' ? Number(window.prompt('Số tiền đã hoàn (VND), nhập 0 nếu chưa hoàn:', String(order.amount)) ?? '0') : 0
    const { error } = await supabase.rpc('cancel_order', { p_order_id: order.id, p_refund_amount: refunded, p_note: `Hoàn tiền đơn ${order.description}` })
    if (error) window.alert(error.message); else await onUpdated()
  }

  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Shopee</p><h2>Đơn hàng</h2></div>{isAdmin && <button className="primary-button compact" onClick={() => setShowNew(true)}><Plus size={18} />Thêm đơn</button>}</div>
    {isAdmin && selected.length > 0 && <section className="selection-bar"><span>Chọn {selected.length} đơn · tối đa {formatVnd(selectedAmount)}</span><button className="primary-button compact" disabled={busy} onClick={() => void markPaid()}><CheckCircle2 size={17} />Ghi nhận khoản đã nhận</button></section>}
    <section className="list-card">{orders.length === 0 ? <p className="empty-state">Chưa có đơn hàng.</p> : orders.map((order) => <article className="order-row" key={order.id}>{isAdmin && order.status === 'unpaid' && <input aria-label={`Chọn ${order.description}`} type="checkbox" checked={selected.includes(order.id)} onChange={() => toggleOrder(order.id)} />}<div className="order-details"><strong>{order.description}</strong><span>{formatDate(order.placed_at)} · Kỳ {order.billing_cycle_id ?? ''}</span></div><div className="order-total"><strong>{formatVnd(order.amount)}</strong>{remainingFor(order)!==order.amount&&<small>Còn {formatVnd(remainingFor(order))}</small>}<span className={`order-status ${order.status}`}>{order.status === 'unpaid' ? 'Chưa trả' : order.status === 'paid' ? 'Đã trả' : 'Đã hủy'}</span></div>{isAdmin && order.status !== 'cancelled' && <div className="order-actions"><button className="text-button" aria-label="Sửa đơn" onClick={() => setEditing(order)}><Pencil size={16}/></button><button className="text-button" aria-label="Hủy đơn" onClick={() => void cancelOrder(order)}><Trash2 size={16}/></button></div>}</article>)}</section>
    {showNew && <OrderDialog onClose={() => setShowNew(false)} onSaved={onUpdated} />}{editing && <OrderDialog order={editing} onClose={() => setEditing(null)} onSaved={onUpdated} />}</section>
}

function OrderDialog({ order, onClose, onSaved }: { order?: Order; onClose: () => void; onSaved: () => Promise<void> }) {
  const [description, setDescription] = useState(order?.description ?? '')
  const [amount, setAmount] = useState(order ? String(order.amount) : '')
  const [placedAt, setPlacedAt] = useState(order?.placed_at ?? today)
  const [error, setError] = useState('')
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const vnd = Number(amount.replace(/,/g, ''))
    if (!supabase || !Number.isInteger(vnd) || vnd <= 0) return setError('Nhập số tiền VND hợp lệ.')
    const cycle = await supabase.from('billing_cycles').select('id,status').eq('label', cycleLabel(placedAt)).maybeSingle()
    if (cycle.data?.status === 'closed') return setError('Kỳ này đã khóa sổ, không thể thêm hoặc sửa đơn.')
    const range = cycleRange(cycleLabel(placedAt))
    const cycleId = cycle.data?.id ?? (await supabase.from('billing_cycles').insert({ label: cycleLabel(placedAt), ...range }).select('id').single()).data?.id
    const result = order
      ? await supabase.from('orders').update({ description, amount: vnd, placed_at: placedAt, billing_cycle_id: cycleId }).eq('id', order.id)
      : await supabase.from('orders').insert({ description, amount: vnd, placed_at: placedAt, billing_cycle_id: cycleId })
    if (result.error) return setError(result.error.message)
    await onSaved(); onClose()
  }
  return <Dialog title={order ? 'Sửa đơn hàng' : 'Thêm đơn hàng'} onClose={onClose}><form className="form-stack" onSubmit={save}><label>Mô tả đơn<input required value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Ngày đặt<input required type="date" value={placedAt} onChange={(event) => setPlacedAt(event.target.value)} /></label><label>Số tiền (VND)<input required inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{error && <p className="form-message">{error}</p>}<button className="primary-button" type="submit">Lưu đơn hàng</button></form></Dialog>
}

function InstallmentsPanel({ plans, isAdmin, onUpdated }: { plans: InstallmentPlan[]; isAdmin: boolean; onUpdated: () => Promise<void> }) {
  const [showCreate, setShowCreate] = useState(false)
  const [showPayment, setShowPayment] = useState<string | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  useEffect(() => { void supabase?.from('installment_payments').select('*').order('paid_at',{ascending:false}).then(({data})=>setPayments(data??[])) }, [plans])
  const addPlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name=String(form.get('name')??'').trim(); const amount=Number(String(form.get('amount')??'').replace(/[^0-9]/g,''))
    if(!supabase || !name || !Number.isSafeInteger(amount) || amount<=0) return window.alert('Tên và tổng tiền không hợp lệ.')
    const {error}=await supabase.from('installment_plans').insert({name,total_amount:amount}); if(error)window.alert(error.message);else{setShowCreate(false);await onUpdated()}
  }
  const addPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if(!supabase||!showPayment)return; const form=new FormData(event.currentTarget); const amount=Number(String(form.get('amount')??'').replace(/[^0-9]/g,'')); const paid_at=String(form.get('paid_at')??today); const note=String(form.get('note')??'')
    if(!Number.isSafeInteger(amount)||amount<=0)return window.alert('Số tiền VND không hợp lệ.')
    const {error}=await supabase.from('installment_payments').insert({plan_id:showPayment,amount,paid_at,note}); if(error)window.alert(error.message); else{setShowPayment(null);await onUpdated()}
  }
  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Khoản riêng</p><h2>Trả góp</h2></div>{isAdmin&&<button className="primary-button compact" onClick={()=>setShowCreate(true)}><Plus size={18}/>Tạo khoản góp</button>}</div><section className="list-card">{plans.length === 0 ? <p className="empty-state">Chưa có khoản trả góp.</p> : plans.map((plan) => { const remaining = plan.total_amount - plan.total_paid; const progress = Math.min(100, Math.round((plan.total_paid / plan.total_amount) * 100)); return <article className="installment-block" key={plan.id}><div className="installment-row"><div><strong>{plan.name}</strong><span>Đã góp {formatVnd(plan.total_paid)} / {formatVnd(plan.total_amount)}</span><div className="progress"><i style={{ width: `${progress}%` }} /></div></div><strong>{formatVnd(remaining)}<small>còn lại</small></strong></div>{isAdmin&&<button className="secondary-button" onClick={()=>setShowPayment(plan.id)}>Thêm lần góp</button>}<div className="payment-history">{payments.filter(p=>p.plan_id===plan.id).map(p=><div key={p.id}><span>{formatDate(p.paid_at)} · {p.note||'Đã góp'}</span><strong>{formatVnd(p.amount)}</strong></div>)}</div></article>})}</section>
    {showCreate&&<Dialog title="Tạo khoản trả góp" onClose={()=>setShowCreate(false)}><form className="form-stack" onSubmit={addPlan}><label>Tên khoản<input required name="name"/></label><label>Tổng tiền (VND)<input required name="amount" inputMode="numeric"/></label><button className="primary-button">Tạo khoản góp</button></form></Dialog>}
    {showPayment&&<Dialog title="Thêm lần góp" onClose={()=>setShowPayment(null)}><form className="form-stack" onSubmit={addPayment}><label>Ngày góp<input required type="date" name="paid_at" defaultValue={today}/></label><label>Số tiền (VND)<input required name="amount" inputMode="numeric"/></label><label>Ghi chú<input name="note"/></label><button className="primary-button">Lưu lần góp</button></form></Dialog>}
  </section>
}

function ReportsPanel({orders,payments,plans,cycles,ledgerEntries,closings,selected,onSelect,onUpdated,isAdmin}:{orders:Order[];payments:Payment[];plans:InstallmentPlan[];cycles:any[];ledgerEntries:any[];closings:any[];selected:string;onSelect:(v:string)=>void;onUpdated:()=>Promise<void>;isAdmin:boolean}){
  const cycle=cycles.find(c=>c.id===selected)??cycles[0]
  const cycleOrders=cycle?orders.filter(o=>o.billing_cycle_id===cycle.id):[]
  const purchases=cycleOrders.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+o.amount,0)
  const paid=payments.filter(p=>cycle&&p.paid_at>=cycle.starts_on&&p.paid_at<=cycle.ends_on).reduce((s,p)=>s+p.amount,0)
  const adjustments=ledgerEntries.filter(e=>e.billing_cycle_id===cycle?.id).reduce((s,e)=>s+e.amount,0)
  const opening=cycle?.opening_balance??0
  const snapshot=closings.find(c=>c.billing_cycle_id===cycle?.id)
  const ending=snapshot?.closing_balance??(opening+purchases-paid+adjustments)
  const exportCsv=()=>{
    const rows=[['Loại','Ngày','Nội dung','Số tiền (VND)','Trạng thái'],...cycleOrders.map(o=>['Đơn hàng',o.placed_at,o.description,String(o.amount),o.status]),...payments.filter(p=>cycle&&p.paid_at>=cycle.starts_on&&p.paid_at<=cycle.ends_on).map(p=>['Thanh toán',p.paid_at,p.note??'',String(p.amount),'Đã nhận']),...ledgerEntries.filter(e=>e.billing_cycle_id===cycle?.id).map(e=>['Điều chỉnh',e.entry_date,e.description,String(e.amount),e.kind])]
    const blob=new Blob(['\ufeff'+rows.map(r=>r.map(x=>'"'+x.replaceAll('"','""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`bao-cao-${cycle?.label??'ky'}.csv`;link.click();URL.revokeObjectURL(link.href)
  }
  const pdf=()=>window.print()
  const toggleClose=async()=>{if(!supabase||!cycle)return;const {error}=await supabase.rpc(cycle.status==='closed'?'reopen_billing_cycle':'close_billing_cycle',{p_cycle_id:cycle.id});if(error)window.alert(error.message);else await onUpdated()}
  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Đối soát</p><h2>Báo cáo kỳ</h2></div><div className="report-actions"><button className="secondary-button" onClick={exportCsv}>Xuất CSV mở bằng Excel</button><button className="secondary-button" onClick={pdf}>In / lưu PDF</button></div></div>{cycles.length===0?<section className="list-card empty-state">Chưa có kỳ sổ nào.</section>:<><label>Kỳ sổ<select value={cycle?.id??''} onChange={e=>onSelect(e.target.value)}>{cycles.map(c=><option key={c.id} value={c.id}>{c.label} · {c.status==='closed'?'Đã khóa':'Đang mở'}</option>)}</select></label><section className="metric-grid"><article className="metric"><span>Dư đầu kỳ</span><strong>{formatVnd(opening)}</strong></article><article className="metric"><span>Đơn phát sinh</span><strong>{formatVnd(purchases)}</strong></article><article className="metric"><span>Đã trả trong kỳ</span><strong>{formatVnd(paid)}</strong></article><article className="metric"><span>Còn lại theo kỳ</span><strong>{formatVnd(ending)}</strong></article></section><section className="list-card report-orders">{cycleOrders.length?cycleOrders.map(o=><div className="report-line" key={o.id}><span>{formatDate(o.placed_at)} · {o.description}</span><strong>{formatVnd(o.amount)}</strong></div>):<p className="empty-state">Kỳ này chưa có đơn hàng.</p>}{isAdmin&&<button className="primary-button compact" onClick={()=>void toggleClose()}>{cycle.status==='closed'?'Mở khóa kỳ':'Khóa sổ kỳ này'}</button>}{cycle.status==='closed'&&<p className="hint">Kỳ đã khóa. Báo cáo đọc số dư đã lưu tại thời điểm khóa.</p>}</section></>}</section>
}

function PaymentCard({ onClose }: { onClose: () => void }) {
  return <Dialog title="Thanh toán" onClose={onClose}><div className="payment-card">{paymentQrUrl ? <img src={paymentQrUrl} alt="Mã VietQR thanh toán" /> : <p className="form-message">QR chưa được cấu hình.</p>}<strong>{payeeName || 'Chưa cấu hình tên người nhận'}</strong><span>{payeeBank} · {payeeAccount || 'Chưa cấu hình số tài khoản'}</span><p className="payment-note">Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé.</p></div></Dialog>
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="dialog-heading"><h2>{title}</h2><button className="text-button" onClick={onClose}>Đóng</button></div>{children}</section></div>
}
