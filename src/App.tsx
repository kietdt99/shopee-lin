import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, LogOut, Package, Plus, ReceiptText, Smartphone, Pencil, Trash2, Users } from 'lucide-react'
import { formatDate, formatVnd } from './lib/format'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { InstallmentPlan, Order, Payment, Profile } from './types'

type Tab = 'overview' | 'orders' | 'installments' | 'reports' | 'accounts'

const payeeName = import.meta.env.VITE_PAYEE_NAME ?? ''
const payeeAccount = import.meta.env.VITE_PAYEE_ACCOUNT ?? ''
const payeeBank = import.meta.env.VITE_PAYEE_BANK ?? 'TPB'
const paymentQrUrl = payeeName && payeeAccount
  ? `https://img.vietqr.io/image/${payeeBank}-${payeeAccount}-compact2.png?accountName=${encodeURIComponent(payeeName)}`
  : ''
const localSupabaseUrl = (() => {
  if (!import.meta.env.DEV || !import.meta.env.VITE_LOCAL_DEV_PASSWORD) return false
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL)
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '54321'
  } catch {
    return false
  }
})()
const localLoginAccounts = localSupabaseUrl
  ? [
      { label: 'Admin', email: import.meta.env.VITE_LOCAL_ADMIN_EMAIL ?? '' },
      { label: 'Tester Quèn', email: import.meta.env.VITE_LOCAL_VIEWER_EMAIL ?? '' },
    ].filter((account) => account.email)
  : []
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
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
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(() => new URLSearchParams(window.location.search).get('error_code') === 'otp_expired'
    ? 'Recovery link đã hết hạn. Nhắn bé Kịt tạo link mới nhé.'
    : '')
  const [passwordSetup, setPasswordSetup] = useState(() => new URLSearchParams(window.location.search).has('set-password'))
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [plans, setPlans] = useState<InstallmentPlan[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [showPayCard, setShowPayCard] = useState(false)
  const [showDisplayName, setShowDisplayName] = useState(false)
  const [cycles, setCycles] = useState<any[]>([])
  const [allocations, setAllocations] = useState<any[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([])
  const [closings, setClosings] = useState<any[]>([])
  const [reportCycle, setReportCycle] = useState('')
  const [installmentPayments, setInstallmentPayments] = useState<any[]>([])
  const [accounts, setAccounts] = useState<Profile[]>([])

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

    const [profileResult, accountResult, orderResult, paymentResult, planResult, cycleResult, installmentPaymentResult, allocationResult, ledgerResult, closingResult] = await Promise.all([
      client.from('profiles').select('id,email,full_name,role').eq('id', user.id).single(),
      client.from('profiles').select('id,email,full_name,role').order('role').order('full_name'),
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
      setAccounts((accountResult.data ?? []) as Profile[])
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
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && localStorage.getItem('shopee-lin-password-setup') === 'true')) {
        setPasswordSetup(true)
      }
      void loadData()
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!client) return
    setMessage('Đang đăng nhập…')
    const { error } = await client.auth.signInWithPassword({ email, password })
    setMessage(error ? 'Email hoặc password chưa đúng.' : '')
  }

  const signInAsLocal = async (account: { label: string; email: string }) => {
    if (!client || !localSupabaseUrl || !import.meta.env.VITE_LOCAL_DEV_PASSWORD) return
    setEmail(account.email)
    setPassword('')
    setMessage(`Đang đăng nhập local với ${account.label}…`)
    const { error } = await client.auth.signInWithPassword({ email: account.email, password: import.meta.env.VITE_LOCAL_DEV_PASSWORD })
    setMessage(error ? `Đăng nhập local thất bại với ${account.label}. Hãy chạy lại pnpm supabase:local:start.` : '')
  }

  const startPasswordSetup = async () => {
    if (!client || !email) return setMessage('Nhập email trước nhé.')
    localStorage.setItem('shopee-lin-password-setup', 'true')
    setMessage('Đang gửi link kích hoạt…')
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}?set-password=1`, shouldCreateUser: true },
    })
    if (error) {
      localStorage.removeItem('shopee-lin-password-setup')
      setMessage(error.message)
    } else setMessage('Đã gửi link. Mở email trên browser này để đặt password một lần.')
  }

  const startPasswordReset = async () => {
    if (!client || !email) return setMessage('Nhập email trước nhé.')
    setMessage('Đang gửi link reset password…')
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    })
    setMessage(error ? error.message : 'Nếu email đã được cấp quyền, link reset sẽ được gửi tới hộp thư.')
  }

  const updatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!client) return
    if (password.length < 8) return setMessage('Password cần ít nhất 8 ký tự.')
    const { error } = await client.auth.updateUser({ password })
    if (error) return setMessage(error.message)
    localStorage.removeItem('shopee-lin-password-setup')
    setPasswordSetup(false)
    setPassword('')
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.delete('set-password')
    const cleanPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
    window.history.replaceState(window.history.state, '', cleanPath)
    setMessage('Đã đặt password. Từ lần sau đăng nhập bằng email và password.')
    await loadData()
  }

  const signOut = async () => {
    await client?.auth.signOut()
    setProfile(null)
    setOrders([])
  }

  if (!isSupabaseConfigured) return <ConfigurationNotice />
  if (loading) return <main className="centered"><p>Đang mở sổ nợ của Bé Lin…</p></main>
  if (passwordSetup) return <PasswordSetup email={email} password={password} message={message} onPasswordChange={setPassword} onSubmit={updatePassword} />
  if (!profile) return <Login email={email} password={password} message={message} localAccounts={localLoginAccounts} onLoginAsLocal={(account) => void signInAsLocal(account)} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={signIn} onSetup={startPasswordSetup} onReset={startPasswordReset} />

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand-link" type="button" onClick={() => setTab('overview')} aria-label="ShopeeLin — Tổng Quan">
          <span className="brand-mark" aria-hidden="true">S</span><span>ShopeeLin</span>
        </button>
        <nav className="tabs" aria-label="Điều hướng">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<ReceiptText size={18} />} label="Tổng Quan" />
          <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} icon={<Package size={18} />} label="Đơn Hàng" />
          <TabButton active={tab === 'installments'} onClick={() => setTab('installments')} icon={<CreditCard size={18} />} label="Trả Góp" />
          <TabButton active={tab === 'reports'} onClick={() => setTab('reports')} icon={<ReceiptText size={18} />} label="Báo Cáo" />
          {isAdmin && <TabButton active={tab === 'accounts'} onClick={() => setTab('accounts')} icon={<Users size={18} />} label="Tài Khoản" />}
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="current-page"><h1>{tabLabels[tab]}</h1></div>
          <div className="profile-chip">
            <span className="profile-name">{profile.full_name}</span>
            <button className="icon-button" onClick={() => setShowDisplayName(true)} aria-label="Sửa Hồ Sơ" title="Sửa Hồ Sơ"><Pencil size={16} /></button>
            <button className="icon-button" onClick={() => void signOut()} aria-label="Đăng xuất"><LogOut size={18} /></button>
          </div>
        </header>

        {tab === 'overview' && <Overview outstanding={outstanding} paid={paidThisList} plans={plans} isAdmin={isAdmin} onPay={() => setShowPayCard(true)} />}
        {tab === 'orders' && <OrdersPanel orders={orders} allocations={allocations} isAdmin={isAdmin} onUpdated={loadData} />}
        {tab === 'installments' && <InstallmentsPanel plans={plans} isAdmin={isAdmin} onUpdated={loadData} />}
        {tab === 'reports' && <ReportsPanel orders={orders} payments={payments} plans={plans} cycles={cycles} ledgerEntries={ledgerEntries} closings={closings} selected={reportCycle} onSelect={setReportCycle} onUpdated={loadData} isAdmin={isAdmin} />}
        {tab === 'accounts' && isAdmin && <AccountsPanel accounts={accounts} />}
      </div>

      {showPayCard && <PaymentCard onClose={() => setShowPayCard(false)} />}
      {showDisplayName && <DisplayNameDialog name={profile.full_name} onClose={() => setShowDisplayName(false)} onSaved={loadData} />}
    </main>
  )
}

const tabLabels: Record<Tab, string> = {
  overview: 'Tổng Quan',
  orders: 'Đơn Hàng',
  installments: 'Trả Góp',
  reports: 'Báo Cáo',
  accounts: 'Tài Khoản',
}

function ConfigurationNotice() {
  return <main className="centered"><section className="auth-card"><h1>Cần cấu hình Supabase</h1><p>Thêm Project URL và Publishable key vào file <code>.env.local</code> để chạy ứng dụng.</p></section></main>
}

function Login({ email, password, message, localAccounts, onLoginAsLocal, onEmailChange, onPasswordChange, onSubmit, onSetup, onReset }: { email: string; password: string; message: string; localAccounts: { label: string; email: string }[]; onLoginAsLocal: (account: { label: string; email: string }) => void; onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onSetup: () => void; onReset: () => void }) {
  return <main className="centered"><section className="auth-card"><p className="eyebrow">Sổ chi tiêu</p><h1>Bé Lin</h1><p>Đăng nhập bằng email và password.</p><form onSubmit={onSubmit}><label>Email<input required type="email" autoComplete="username" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="email@example.com" /></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label><button className="primary-button" type="submit">Đăng nhập</button></form>{localAccounts.length > 0 && <section className="local-login-picker" aria-label="Local account shortcuts"><p className="local-login-title">Login as</p><div className="local-login-options">{localAccounts.map((account) => <button className="local-login-option" data-testid={`local-login-${account.label === 'Admin' ? 'admin' : 'tester'}`} key={account.email} type="button" onClick={() => onLoginAsLocal(account)}><strong>{account.label}</strong><span>{account.email}</span></button>)}</div><p className="local-login-hint">Chỉ dùng Supabase local; không đăng nhập vào production.</p></section>}<div className="auth-links"><button className="text-button" type="button" onClick={onSetup}>Đặt password lần đầu</button><button className="text-button" type="button" onClick={onReset}>Quên password?</button></div>{message && <p className="form-message">{message}</p>}</section></main>
}

function PasswordSetup({ email, password, message, onPasswordChange, onSubmit }: { email: string; password: string; message: string; onPasswordChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <main className="centered"><section className="auth-card"><p className="eyebrow">Thiết lập tài khoản</p><h1>Đặt password</h1><p>{email ? `Tài khoản ${email}` : 'Tạo password để lần sau đăng nhập không cần mở email.'}</p><form onSubmit={onSubmit}><label>Password mới<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label><button className="primary-button" type="submit">Lưu password</button></form>{message && <p className="form-message">{message}</p>}</section></main>
}

function AccountsPanel({ accounts }: { accounts: Profile[] }) {
  const [resetting, setResetting] = useState<Profile | null>(null)
  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Admin</p><h2>Quản lý tài khoản</h2></div></div><p className="hint">Tạo recovery link dùng một lần để user tự đặt password mới. Link không gửi email và hết hạn sau 5 phút.</p><section className="list-card">{accounts.length === 0 ? <p className="empty-state">Chưa có account nào.</p> : accounts.map((account) => <article className="account-row" key={account.id}><div className="order-details"><strong>{account.full_name}</strong><span>{account.email} · {account.role === 'admin' ? 'Admin' : 'Viewer'}</span></div>{account.role === 'viewer' && <button className="secondary-button" onClick={() => setResetting(account)}>Reset password</button>}</article>)}</section>{resetting && <RecoveryLinkDialog account={resetting} onClose={() => setResetting(null)} />}</section>
}

function RecoveryLinkDialog({ account, onClose }: { account: Profile; onClose: () => void }) {
  const [link, setLink] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const [remaining, setRemaining] = useState(300)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const createLink = async () => {
    if (!supabase) return setError('Supabase chưa được cấu hình.')
    setLoading(true)
    setError('')
    setLink('')
    setCopied(false)
    const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { data, error: invokeError } = await supabase.functions.invoke('admin-reset-password-link', { body: { targetUserId: account.id, redirectUrl } })
    setLoading(false)
    if (invokeError) return setError(invokeError.message)
    setLink(data.actionLink as string)
    setExpiresAt(Date.parse(data.expiresAt as string))
  }

  useEffect(() => {
    if (!expiresAt) return
    const update = () => setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setError('Không copy tự động được. Chọn và copy link trong ô bên dưới nhé.')
    }
  }

  return <Dialog title="Reset password" onClose={onClose}><div className="form-stack"><p>Tài khoản: <strong>{account.full_name}</strong> · {account.email}</p>{!link && <><p className="hint">Tạo recovery link dùng một lần. Link sẽ không gửi email; gửi riêng cho user sau khi copy.</p><button className="primary-button" type="button" disabled={loading} onClick={() => void createLink()}>{loading ? 'Đang tạo link…' : 'Tạo recovery link'}</button></>}{error && <p className="form-message">{error}</p>}{link && <><label>Recovery link<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label><div className="recovery-link-actions"><span className={remaining === 0 ? 'expired' : 'hint'}>{remaining === 0 ? 'Link đã hết hạn' : `Hết hạn sau ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</span><button className="primary-button compact" type="button" disabled={remaining === 0} onClick={() => void copyLink()}>{copied ? 'Đã copy' : 'Copy link'}</button></div><p className="hint">Gửi link riêng cho user. Link chỉ dùng một lần; khi mở, user sẽ đặt password mới. Đóng cửa sổ sẽ xóa link khỏi app.</p></>}</div></Dialog>
}

function DisplayNameDialog({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(name)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true)
    const { error: updateError } = await supabase.rpc('update_my_display_name', { p_display_name: displayName.trim() })
    setSaving(false)
    if (updateError) return setError(updateError.message)
    await onSaved()
    onClose()
  }
  return <Dialog title="Đổi display name" onClose={onClose}><form className="form-stack" onSubmit={save}><label>Display name<input required maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>{error && <p className="form-message">{error}</p>}<button className="primary-button" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu tên hiển thị'}</button></form></Dialog>
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
    const excelEscape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
    const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Bao cao ${cycle?.label??''}"><Table>${rows.map(row=>`<Row>${row.map((cell,index)=>`<Cell><Data ss:Type="${index===3&&/^[-0-9]+$/.test(cell)?'Number':'String'}">${excelEscape(cell)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`
    const blob=new Blob([xml],{type:'application/vnd.ms-excel;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`bao-cao-${cycle?.label??'ky'}.xls`;link.click();URL.revokeObjectURL(link.href)
  }
  const pdf=()=>window.print()
  const toggleClose=async()=>{if(!supabase||!cycle)return;const {error}=await supabase.rpc(cycle.status==='closed'?'reopen_billing_cycle':'close_billing_cycle',{p_cycle_id:cycle.id});if(error)window.alert(error.message);else await onUpdated()}
  return <section className="content-stack report-panel"><div className="page-heading"><div><p className="eyebrow">Đối soát</p><h2>Báo cáo kỳ</h2></div><div className="report-actions"><button className="secondary-button" onClick={exportCsv}>Xuất Excel</button><button className="secondary-button" onClick={pdf}>Lưu PDF</button></div></div>{cycles.length===0?<section className="list-card empty-state">Chưa có kỳ sổ nào.</section>:<><label>Kỳ sổ<select value={cycle?.id??''} onChange={e=>onSelect(e.target.value)}>{cycles.map(c=><option key={c.id} value={c.id}>{c.label} · {c.status==='closed'?'Đã khóa':'Đang mở'}</option>)}</select></label><section className="metric-grid"><article className="metric"><span>Dư đầu kỳ</span><strong>{formatVnd(opening)}</strong></article><article className="metric"><span>Đơn phát sinh</span><strong>{formatVnd(purchases)}</strong></article><article className="metric"><span>Đã trả trong kỳ</span><strong>{formatVnd(paid)}</strong></article><article className="metric"><span>Còn lại theo kỳ</span><strong>{formatVnd(ending)}</strong></article></section><section className="list-card report-orders">{cycleOrders.length?cycleOrders.map(o=><div className="report-line" key={o.id}><span>{formatDate(o.placed_at)} · {o.description}</span><strong>{formatVnd(o.amount)}</strong></div>):<p className="empty-state">Kỳ này chưa có đơn hàng.</p>}{isAdmin&&<button className="primary-button compact" onClick={()=>void toggleClose()}>{cycle.status==='closed'?'Mở khóa kỳ':'Khóa sổ kỳ này'}</button>}{cycle.status==='closed'&&<p className="hint">Kỳ đã khóa. Báo cáo đọc số dư đã lưu tại thời điểm khóa.</p>}</section></>}</section>
}

function PaymentCard({ onClose }: { onClose: () => void }) {
  return <Dialog title="Thanh toán" onClose={onClose}><div className="payment-card">{paymentQrUrl ? <img src={paymentQrUrl} alt="Mã VietQR thanh toán" /> : <p className="form-message">QR chưa được cấu hình.</p>}<strong>{payeeName || 'Chưa cấu hình tên người nhận'}</strong><span>{payeeBank} · {payeeAccount || 'Chưa cấu hình số tài khoản'}</span><p className="payment-note">Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé.</p></div></Dialog>
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="dialog-heading"><h2>{title}</h2><button className="text-button" onClick={onClose}>Đóng</button></div>{children}</section></div>
}
