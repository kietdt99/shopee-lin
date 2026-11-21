import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleX, CreditCard, Eye, LogOut, Package, Plus, ReceiptText, RotateCcw, Search, Smartphone, Pencil, Trash2, Users } from 'lucide-react'
import { formatDate, formatVnd } from './lib/format'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { ProfileAvatar } from './ProfileAvatar'
import type { InstallmentPlan, Order, Payment, Profile } from './types'

type Tab = 'overview' | 'orders' | 'installments' | 'reports' | 'accounts'

const payeeName = import.meta.env.VITE_PAYEE_NAME ?? ''
const payeeAccount = import.meta.env.VITE_PAYEE_ACCOUNT ?? ''
const payeeBank = import.meta.env.VITE_PAYEE_BANK ?? 'TPB'
const paymentQrUrl = payeeName && payeeAccount
  ? `https://img.vietqr.io/image/${payeeBank}-${payeeAccount}-compact2.png?accountName=${encodeURIComponent(payeeName)}`
  : ''
const localSupabaseUrl = (() => {
  if (!import.meta.env.DEV || import.meta.env.VITE_LOCAL_LOGIN_SHORTCUTS !== 'true' || !import.meta.env.VITE_LOCAL_DEV_PASSWORD) return false
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
const parseVndInput = (value: string) => {
  const trimmed = value.trim()
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(trimmed)) return null
  const parsed = Number(trimmed.replace(/[.,]/g, ''))
  return Number.isSafeInteger(parsed) ? parsed : null
}
const validShopeeOrderUrl = (value: string | null | undefined) => {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !['shopee.vn', 'www.shopee.vn'].includes(url.hostname) || !/^\/user\/purchase\/order\/\d+\/?$/.test(url.pathname)) return null
    return url.toString()
  } catch {
    return null
  }
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
    () => {
      const activeOrders = orders.filter((order) => order.status !== 'cancelled' && !order.deleted_at)
      const activeOrderIds = new Set(activeOrders.map((order) => order.id))
      const activeAllocations = allocations.filter((allocation) => activeOrderIds.has(allocation.order_id))
      return Math.max(0, activeOrders.reduce((total, order) => total + order.amount, 0) - activeAllocations.reduce((total, allocation) => total + allocation.amount, 0) + ledgerEntries.reduce((total, entry) => total + entry.amount, 0))
    },
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
      client.from('profiles').select('id,email,full_name,role,avatar_path').eq('id', user.id).single(),
      client.from('profiles').select('id,email,full_name,role').order('role').order('full_name'),
      client.from('orders').select('id,placed_at,description,shopee_order_url,amount,status,billing_cycle_id,deleted_at').order('placed_at', { ascending: false }),
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
          <div className="profile-chip">
            <span className="profile-name">{profile.full_name}</span>
            <button className="icon-button" onClick={() => setShowDisplayName(true)} aria-label="Sửa Hồ Sơ" title="Sửa Hồ Sơ"><Pencil size={16} /></button>
            <button className="icon-button" onClick={() => void signOut()} aria-label="Đăng xuất"><LogOut size={18} /></button>
          </div>
        </header>

        {tab === 'overview' && <Overview outstanding={outstanding} paid={paidThisList} plans={plans} isAdmin={isAdmin} onPay={() => setShowPayCard(true)} />}
      {tab === 'orders' && <OrdersPanel orders={orders} allocations={allocations} cycles={cycles} isAdmin={isAdmin} onUpdated={loadData} />}
        {tab === 'installments' && <InstallmentsPanel plans={plans} isAdmin={isAdmin} onUpdated={loadData} />}
        {tab === 'reports' && <ReportsPanel orders={orders} payments={payments} plans={plans} cycles={cycles} ledgerEntries={ledgerEntries} closings={closings} selected={reportCycle} onSelect={setReportCycle} onUpdated={loadData} isAdmin={isAdmin} />}
        {tab === 'accounts' && isAdmin && <AccountsPanel accounts={accounts} />}
      </div>

      {showPayCard && <PaymentCard onClose={() => setShowPayCard(false)} />}
      {showDisplayName && <DisplayNameDialog profile={profile} onClose={() => setShowDisplayName(false)} onSaved={loadData} />}
    </main>
  )
}

function ConfigurationNotice() {
  return <main className="centered"><section className="auth-card"><h1>Cần cấu hình Supabase</h1><p>Thêm Project URL và Publishable key vào file <code>.env.local</code> để chạy ứng dụng.</p></section></main>
}

function Login({ email, password, message, localAccounts, onLoginAsLocal, onEmailChange, onPasswordChange, onSubmit, onSetup, onReset }: { email: string; password: string; message: string; localAccounts: { label: string; email: string }[]; onLoginAsLocal: (account: { label: string; email: string }) => void; onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onSetup: () => void; onReset: () => void }) {
  if (localAccounts.length > 0) {
    return <main className="centered"><section className="auth-card"><p className="eyebrow">ShopeeLin · Local</p><h1>Chọn Tài Khoản</h1><p>Chọn một tài khoản để kiểm tra quyền và giao diện.</p><section className="local-login-picker" aria-label="Tài Khoản Local"><div className="local-login-options">{localAccounts.map((account) => <button className="local-login-option" data-testid={`local-login-${account.label === 'Admin' ? 'admin' : 'tester'}`} key={account.email} type="button" onClick={() => onLoginAsLocal(account)}><strong>{account.label}</strong><span>{account.email}</span></button>)}</div><p className="local-login-hint">Chỉ kết nối Supabase local; không đăng nhập vào production.</p></section>{message && <p className="form-message">{message}</p>}</section></main>
  }
  return <main className="centered"><section className="auth-card"><p className="eyebrow">ShopeeLin</p><h1>Bé Lin</h1><p>Đăng nhập bằng email và mật khẩu.</p><form onSubmit={onSubmit}><label>Email<input required type="email" autoComplete="username" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="email@example.com" /></label><label>Mật Khẩu<input required type="password" autoComplete="current-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label><button className="primary-button" type="submit">Đăng nhập</button></form><div className="auth-links"><button className="text-button" type="button" onClick={onSetup}>Đặt mật khẩu lần đầu</button><button className="text-button" type="button" onClick={onReset}>Quên mật khẩu?</button></div>{message && <p className="form-message">{message}</p>}</section></main>
}

function PasswordSetup({ email, password, message, onPasswordChange, onSubmit }: { email: string; password: string; message: string; onPasswordChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <main className="centered"><section className="auth-card"><p className="eyebrow">Thiết Lập Tài Khoản</p><h1>Đặt Mật Khẩu</h1><p>{email ? `Tài khoản ${email}` : 'Tạo mật khẩu để lần sau đăng nhập không cần mở email.'}</p><form onSubmit={onSubmit}><label>Mật Khẩu Mới<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label><button className="primary-button" type="submit">Lưu Mật Khẩu</button></form>{message && <p className="form-message">{message}</p>}</section></main>
}

function AccountsPanel({ accounts }: { accounts: Profile[] }) {
  const [resetting, setResetting] = useState<Profile | null>(null)
  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Admin</p><h2>Quản Lý Tài Khoản</h2></div></div><p className="hint">Tạo link dùng một lần để user đặt mật khẩu mới. Link không gửi email và hết hạn sau 5 phút.</p><section className="list-card">{accounts.length === 0 ? <p className="empty-state">Chưa có tài khoản nào.</p> : accounts.map((account) => <article className="account-row" key={account.id}><div className="order-details"><strong>{account.full_name}</strong><span>{account.email} · {account.role === 'admin' ? 'Admin' : 'Viewer'}</span></div>{account.role === 'viewer' && <button className="secondary-button" onClick={() => setResetting(account)}>Đặt Lại Mật Khẩu</button>}</article>)}</section>{resetting && <RecoveryLinkDialog account={resetting} onClose={() => setResetting(null)} />}</section>
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

  return <Dialog title="Đặt Lại Mật Khẩu" onClose={onClose}><div className="form-stack"><p>Tài khoản: <strong>{account.full_name}</strong> · {account.email}</p>{!link && <><p className="hint">Tạo link đặt lại mật khẩu dùng một lần. Link không gửi email; hãy gửi riêng cho user.</p><button className="primary-button" type="button" disabled={loading} onClick={() => void createLink()}>{loading ? 'Đang tạo liên kết…' : 'Tạo Liên Kết'}</button></>}{error && <p className="form-message">{error}</p>}{link && <><label>Liên Kết Khôi Phục<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label><div className="recovery-link-actions"><span className={remaining === 0 ? 'expired' : 'hint'}>{remaining === 0 ? 'Liên kết đã hết hạn' : `Hết hạn sau ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</span><button className="primary-button compact" type="button" disabled={remaining === 0} onClick={() => void copyLink()}>{copied ? 'Đã Sao Chép' : 'Sao Chép Liên Kết'}</button></div><p className="hint">Gửi liên kết riêng cho user. Liên kết chỉ dùng một lần; khi mở, user sẽ đặt mật khẩu mới. Đóng cửa sổ sẽ xóa liên kết khỏi app.</p></>}</div></Dialog>
}

function DisplayNameDialog({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(profile.full_name)
  const [avatarPath, setAvatarPath] = useState(profile.avatar_path ?? null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true)
    const { error: updateError } = await supabase.rpc('update_my_profile', { p_display_name: displayName.trim(), p_avatar_path: avatarPath })
    setSaving(false)
    if (updateError) return setError(updateError.message)
    await onSaved()
    onClose()
  }
  return <Dialog title="Hồ Sơ" onClose={onClose}><form className="form-stack" onSubmit={save}><ProfileAvatar userId={profile.id} avatarPath={avatarPath} displayName={displayName} onPathChange={setAvatarPath} /><label>Tên Hiển Thị<input required maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Email<input readOnly value={profile.email} /></label>{error && <p className="form-message">{error}</p>}<button className="primary-button" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu Thay Đổi'}</button></form></Dialog>
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}

function Overview({ outstanding, paid, plans, isAdmin, onPay }: { outstanding: number; paid: number; plans: InstallmentPlan[]; isAdmin: boolean; onPay: () => void }) {
  const installmentRemaining = plans.reduce((total, plan) => total + plan.total_amount - plan.total_paid, 0)
  return <section className="content-stack">
    <section className="balance-card"><p>Dư nợ Shopee hiện tại</p><strong>{formatVnd(outstanding)}</strong><span>Cập nhật từ các đơn chưa thanh toán</span>{!isAdmin && <button className="light-button" onClick={onPay}><Smartphone size={18} />Thanh toán</button>}</section>
    <section className="metric-grid">{isAdmin && <article className="metric"><span>Tổng đã thanh toán</span><strong>{formatVnd(paid)}</strong></article>}<article className="metric"><span>Còn trả góp</span><strong>{formatVnd(installmentRemaining)}</strong></article></section>
    <section className="section-card"><div className="section-heading"><div><p className="eyebrow">Kỳ hiện tại</p><h2>Kỳ {cycleLabel(today)}</h2></div>{isAdmin && <span className="status-pill">Admin</span>}</div><p>{isAdmin ? 'Thêm đơn hàng hoặc ghi nhận khoản Bé Lin đã trả ở tab Đơn hàng.' : 'Theo dõi các đơn chưa trả và dùng QR khi cần thanh toán.'}</p></section>
  </section>
}

type OrderFilterStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled' | 'deleted'

function orderDescriptionLines(description: string) {
  const blocks = description.split(/\n\s*\n+/).map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (blocks.length > 1) return blocks

  const flat = description.replace(/\s+/g, ' ').trim()
  const quantityMarkers = [...flat.matchAll(/\bx\d+(?=\s+\S)/gi)]
  if (quantityMarkers.length < 1) return [flat]
  const chunks: string[] = []
  let start = 0
  for (const marker of quantityMarkers) {
    const end = (marker.index ?? 0) + marker[0].length
    chunks.push(flat.slice(start, end).trim())
    start = end
    while (/\s/.test(flat[start] ?? '')) start += 1
  }
  chunks.push(flat.slice(start).trim())
  const reliable = chunks.length > 1 && chunks.every((chunk) => /Phân loại hàng:/i.test(chunk) && /\bx\d+$/i.test(chunk))
  return reliable ? chunks : [flat]
}

function OrdersPanel({ orders, allocations, cycles, isAdmin, onUpdated }: { orders: Order[]; allocations: any[]; cycles: { id: string; label: string; status?: 'open' | 'closed' }[]; isAdmin: boolean; onUpdated: () => Promise<void> }) {
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [pendingCycles, setPendingCycles] = useState<string[]>([])
  const [pendingStatuses, setPendingStatuses] = useState<OrderFilterStatus[]>([])
  const [appliedCycles, setAppliedCycles] = useState<string[]>([])
  const [appliedStatuses, setAppliedStatuses] = useState<OrderFilterStatus[]>([])
  const remainingFor = (order: Order) => order.amount - allocations.filter((allocation) => allocation.order_id === order.id).reduce((sum, allocation) => sum + allocation.amount, 0)
  const allocatedFor = (order: Order) => allocations.filter((allocation) => allocation.order_id === order.id).reduce((sum, allocation) => sum + allocation.amount, 0)
  const statusFor = (order: Order): OrderFilterStatus => {
    if (order.deleted_at) return 'deleted'
    if (order.status === 'cancelled') return 'cancelled'
    if (order.status === 'paid') return 'paid'
    if (allocatedFor(order) > 0) return 'partial'
    return 'unpaid'
  }
  const cycleIsClosed = (order: Order) => cycles.some((cycle) => cycle.id === order.billing_cycle_id && cycle.status === 'closed')
  const unpaid = orders.filter((order) => (statusFor(order) === 'unpaid' || statusFor(order) === 'partial') && !cycleIsClosed(order))
  const selectedOrders = unpaid.filter((order) => selected.includes(order.id))
  const selectedAmount = selectedOrders.reduce((total, order) => total + remainingFor(order), 0)
  const cycleLabels = new Map(cycles.map((cycle) => [cycle.id, cycle.label]))
  const statusLabels: Record<OrderFilterStatus, string> = { unpaid: 'Chưa Trả', partial: 'Trả Một Phần', paid: 'Đã Trả', cancelled: 'Đã Hủy', deleted: 'Đã Xóa' }
  const statuses = [...new Set(orders.map(statusFor))]
  const filteredOrders = orders.filter((order) => {
    const matchesSearch = !appliedSearch || order.description.toLocaleLowerCase('vi').includes(appliedSearch.toLocaleLowerCase('vi'))
    const matchesCycle = appliedCycles.length === 0 || appliedCycles.includes(order.billing_cycle_id ?? '')
    const matchesStatus = appliedStatuses.length === 0 || appliedStatuses.includes(statusFor(order))
    return matchesSearch && matchesCycle && matchesStatus
  })

  const toggleOrder = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleValue = <T extends string>(values: T[], value: T, update: (next: T[]) => void) => update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  const applyFilters = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAppliedCycles(pendingCycles)
    setAppliedStatuses(pendingStatuses)
    event.currentTarget.closest('details')?.removeAttribute('open')
  }
  const markPaid = async () => {
    if (!supabase || selectedOrders.length === 0) return
    const input = window.prompt(`Số tiền đã nhận (đơn đã chọn tối đa ${formatVnd(selectedAmount)}):`, String(selectedAmount))
    if (input === null) return
    const amount = parseVndInput(input)
    if (amount === null || amount <= 0) return window.alert('Nhập số tiền VND là số nguyên dương; không dùng số âm hoặc phần thập phân.')
    setBusy(true)
    const { error } = await supabase.rpc('record_order_payment', { p_order_ids: selectedOrders.map((order) => order.id), p_amount: amount, p_paid_at: today, p_note: 'Admin xác nhận thanh toán' })
    if (error) window.alert(error.message)
    else setSelected([])
    setBusy(false)
    await onUpdated()
  }
  const softDeleteOrder = async (order: Order) => {
    if (!supabase || !window.confirm(`Đánh dấu đơn “${order.description}” là Đã Xóa? Có thể khôi phục lại sau.`)) return
    const { error } = await supabase.rpc('soft_delete_order', { p_order_id: order.id })
    if (error) window.alert(error.message)
    else { setSelected((current) => current.filter((id) => id !== order.id)); await onUpdated() }
  }
  const restoreOrder = async (order: Order) => {
    if (!supabase || !window.confirm(`Khôi phục đơn “${order.description}”?`)) return
    const { error } = await supabase.rpc('restore_deleted_order', { p_order_id: order.id })
    if (error) window.alert(error.message); else await onUpdated()
  }
  const cancelOrder = async (order: Order) => {
    if (!supabase || !window.confirm(`Hủy đơn “${order.description}”?`)) return
    const allocated = allocatedFor(order)
    const refundInput = allocated > 0 ? window.prompt(`Số tiền đã hoàn (VND), tối đa ${formatVnd(allocated)}; nhập 0 nếu chưa hoàn:`, String(allocated)) : '0'
    if (refundInput === null) return
    const refunded = parseVndInput(refundInput)
    if (refunded === null || refunded < 0 || refunded > allocated) return window.alert('Số tiền hoàn phải là số nguyên không âm và không vượt quá tiền đã phân bổ.')
    const { error } = await supabase.rpc('cancel_order', { p_order_id: order.id, p_refund_amount: refunded, p_note: `Hoàn tiền đơn ${order.description}` })
    if (error) window.alert(error.message); else await onUpdated()
  }

  return <section className="content-stack">
    <div className="page-heading"><div><p className="eyebrow">Shopee</p><h2>Đơn Hàng</h2></div>{isAdmin && <button className="primary-button compact" onClick={() => setShowNew(true)}><Plus size={18} />Thêm Đơn</button>}</div>
    <section className="order-tools">
      <form className="order-search" role="search" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(searchInput.trim()) }}>
        <input aria-label="Tìm Kiếm Đơn Hàng" placeholder="Tìm Kiếm Đơn Hàng" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        <button className="icon-button search-submit" type="submit" aria-label="Tìm Kiếm" title="Tìm Kiếm"><Search size={19} /></button>
      </form>
      <details className="order-filter">
        <summary>Bộ Lọc</summary>
        <div className="order-filter-menu">
          <fieldset><legend>Kỳ Sổ</legend>{cycles.map((cycle) => <label className="filter-option" key={cycle.id}><input type="checkbox" checked={pendingCycles.includes(cycle.id)} onChange={() => toggleValue(pendingCycles, cycle.id, setPendingCycles)} />{cycle.label}</label>)}</fieldset>
          <fieldset><legend>Trạng Thái</legend>{Object.entries(statusLabels).filter(([value]) => statuses.includes(value as OrderFilterStatus)).map(([value, label]) => <label className="filter-option" key={value}><input type="checkbox" checked={pendingStatuses.includes(value as OrderFilterStatus)} onChange={() => toggleValue(pendingStatuses, value as OrderFilterStatus, setPendingStatuses)} />{label}</label>)}</fieldset>
          <button type="button" className="primary-button compact" onClick={applyFilters}>Áp Dụng Bộ Lọc</button>
        </div>
      </details>
    </section>
    {isAdmin && selectedOrders.length > 0 && <section className="selection-bar"><span>Chọn {selectedOrders.length} Đơn · tối đa {formatVnd(selectedAmount)}</span><button className="primary-button compact" disabled={busy} onClick={() => void markPaid()}><CheckCircle2 size={17} />Ghi Nhận Khoản Đã Nhận</button></section>}
    <section className="list-card orders-list">
      {orders.length === 0 ? <p className="empty-state">Chưa Có Đơn Hàng.</p> : filteredOrders.length === 0 ? <p className="empty-state">Không Tìm Thấy Đơn Hàng Phù Hợp.</p> : <div className="orders-table-scroll"><table className="orders-table">
        <thead><tr><th>Ngày</th><th>Đơn Hàng</th><th>Số Tiền</th><th>Trạng Thái</th><th>Hành Động</th></tr></thead>
        <tbody>{filteredOrders.map((order) => {
          const state = statusFor(order)
          const allocated = allocatedFor(order)
          const itemLines = orderDescriptionLines(order.description)
          const canSoftDelete = state === 'unpaid' && allocated === 0
          const cycle = order.billing_cycle_id ? cycleLabels.get(order.billing_cycle_id) : null
          const closed = cycleIsClosed(order)
          const orderUrl = validShopeeOrderUrl(order.shopee_order_url)
          return <tr className={`order-row ${state === 'deleted' ? 'is-deleted' : ''}`} key={order.id}>
            <td data-label="Ngày">{formatDate(order.placed_at)}</td>
            <td data-label="Đơn Hàng"><div className="order-item-lines">{itemLines.map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}</div><small className="order-cycle">{cycle ? `Kỳ ${cycle}${closed ? ' · Đã Khóa' : ''}` : 'Chưa Xác Định Kỳ'}</small></td>
            <td className="amount-cell" data-label="Số Tiền"><strong>{formatVnd(order.amount)}</strong>{allocated > 0 && state !== 'deleted' && <small>Còn {formatVnd(remainingFor(order))}</small>}</td>
            <td data-label="Trạng Thái"><span className={`order-status ${state}`}>{statusLabels[state]}</span></td>
            <td data-label="Hành Động"><div className="order-actions">
              {isAdmin && <a className={`icon-button ${orderUrl ? '' : 'disabled-action'}`} href={orderUrl ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={orderUrl ? 'Xem Đơn Trên Shopee' : 'Chưa Có Mã Đơn Shopee'} title={orderUrl ? 'Xem Đơn Trên Shopee' : 'Chưa Có Mã Đơn Shopee'} aria-disabled={!orderUrl} onClick={(event) => { if (!orderUrl) event.preventDefault() }}><Eye size={18} /></a>}
              {isAdmin && state === 'deleted' && <button className={`icon-button ${closed ? 'disabled-action' : ''}`} type="button" aria-label="Khôi Phục Đơn" title={closed ? 'Mở khóa kỳ để khôi phục' : 'Khôi Phục Đơn'} disabled={closed} onClick={() => void restoreOrder(order)}><RotateCcw size={18} /></button>}
              {isAdmin && state !== 'deleted' && state !== 'cancelled' && !closed && <>
                {(state === 'unpaid' || state === 'partial') && <input aria-label={`Chọn ${order.description}`} type="checkbox" checked={selected.includes(order.id)} onChange={() => toggleOrder(order.id)} />}
                <button className="icon-button" type="button" aria-label="Sửa Đơn" title="Sửa Đơn" onClick={() => setEditing(order)}><Pencil size={18} /></button>
                {canSoftDelete ? <button className="icon-button" type="button" aria-label="Xóa Đơn" title="Xóa Đơn" onClick={() => void softDeleteOrder(order)}><Trash2 size={18} /></button> : <button className="icon-button" type="button" aria-label="Hủy Đơn" title="Hủy Đơn" onClick={() => void cancelOrder(order)}><CircleX size={18} /></button>}
              </>}
            </div></td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>
    {showNew && <OrderDialog onClose={() => setShowNew(false)} onSaved={onUpdated} />}{editing && <OrderDialog order={editing} lockFinancialFields={allocatedFor(editing) > 0 || editing.status === 'paid'} onClose={() => setEditing(null)} onSaved={onUpdated} />}
  </section>
}

function OrderDialog({ order, lockFinancialFields = false, onClose, onSaved }: { order?: Order; lockFinancialFields?: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [description, setDescription] = useState(order?.description ?? '')
  const [shopeeOrderUrl, setShopeeOrderUrl] = useState(order?.shopee_order_url ?? '')
  const [amount, setAmount] = useState(order ? String(order.amount) : '')
  const [placedAt, setPlacedAt] = useState(order?.placed_at ?? today)
  const [error, setError] = useState('')
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedDescription = description.trim()
    const vnd = parseVndInput(amount)
    if (!normalizedDescription) return setError('Mô tả đơn hàng không được để trống.')
    if (!supabase || vnd === null || vnd <= 0) return setError('Nhập số tiền VND là số nguyên dương.')
    const enteredShopeeOrderUrl = shopeeOrderUrl.trim()
    const normalizedShopeeOrderUrl = validShopeeOrderUrl(enteredShopeeOrderUrl)
    if (enteredShopeeOrderUrl && !normalizedShopeeOrderUrl) return setError('Nhập link đơn hàng Shopee hợp lệ, ví dụ https://shopee.vn/user/purchase/order/248511385254562?type=3.')
    const cycle = await supabase.from('billing_cycles').select('id,status').eq('label', cycleLabel(placedAt)).maybeSingle()
    if (cycle.data?.status === 'closed') return setError('Kỳ này đã khóa sổ, không thể thêm hoặc sửa đơn.')
    const range = cycleRange(cycleLabel(placedAt))
    const cycleId = cycle.data?.id ?? (await supabase.from('billing_cycles').insert({ label: cycleLabel(placedAt), ...range }).select('id').single()).data?.id
    const result = order
      ? await supabase.rpc('update_order', { p_order_id: order.id, p_placed_at: placedAt, p_description: normalizedDescription, p_amount: vnd, p_billing_cycle_id: cycleId, p_notes: order.notes ?? null, p_shopee_order_url: normalizedShopeeOrderUrl })
      : await supabase.from('orders').insert({ description: normalizedDescription, shopee_order_url: normalizedShopeeOrderUrl, amount: vnd, placed_at: placedAt, billing_cycle_id: cycleId })
    if (result.error) return setError(result.error.message)
    await onSaved(); onClose()
  }
  return <Dialog title={order ? 'Sửa Đơn Hàng' : 'Thêm Đơn Hàng'} onClose={onClose}><form className="form-stack" onSubmit={save}><label>Mô Tả Đơn Hàng<input required value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Đơn Hàng Shopee (Không Bắt Buộc)<input type="url" value={shopeeOrderUrl} onChange={(event) => setShopeeOrderUrl(event.target.value)} placeholder="https://shopee.vn/user/purchase/order/248511385254562?type=3" /></label><label>Ngày Đặt<input required type="date" value={placedAt} disabled={lockFinancialFields} onChange={(event) => setPlacedAt(event.target.value)} /></label><label>Số Tiền (VND)<input required inputMode="numeric" value={amount} disabled={lockFinancialFields} onChange={(event) => setAmount(event.target.value)} /></label>{lockFinancialFields && <p className="hint">Đơn đã có phân bổ thanh toán nên ngày đặt và số tiền được khóa để giữ đúng lịch sử.</p>}{error && <p className="form-message">{error}</p>}<button className="primary-button" type="submit">Lưu Đơn Hàng</button></form></Dialog>
}

function InstallmentsPanel({ plans, isAdmin, onUpdated }: { plans: InstallmentPlan[]; isAdmin: boolean; onUpdated: () => Promise<void> }) {
  const [showCreate, setShowCreate] = useState(false)
  const [showPayment, setShowPayment] = useState<string | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  useEffect(() => { void supabase?.from('installment_payments').select('*').order('paid_at',{ascending:false}).then(({data})=>setPayments(data??[])) }, [plans])
  const addPlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name=String(form.get('name')??'').trim(); const amount=parseVndInput(String(form.get('amount')??''))
    if(!supabase || !name || amount===null || amount<=0) return window.alert('Tên khoản và tổng tiền VND chưa hợp lệ.')
    const {error}=await supabase.from('installment_plans').insert({name,total_amount:amount}); if(error)window.alert(error.message);else{setShowCreate(false);await onUpdated()}
  }
  const addPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if(!supabase||!showPayment)return; const form=new FormData(event.currentTarget); const amount=parseVndInput(String(form.get('amount')??'')); const paid_at=String(form.get('paid_at')??today); const note=String(form.get('note')??'')
    if(amount===null||amount<=0)return window.alert('Số tiền VND phải là số nguyên dương.')
    const plan=plans.find(item=>item.id===showPayment); const remaining=plan ? plan.total_amount-plan.total_paid : 0
    if(amount>remaining)return window.alert(`Số tiền góp vượt quá số còn lại ${formatVnd(remaining)}.`)
    const {error}=await supabase.rpc('record_installment_payment',{p_plan_id:showPayment,p_amount:amount,p_paid_at:paid_at,p_note:note||null}); if(error)window.alert(error.message); else{setShowPayment(null);await onUpdated()}
  }
  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Khoản riêng</p><h2>Trả Góp</h2></div>{isAdmin&&<button className="primary-button compact" onClick={()=>setShowCreate(true)}><Plus size={18}/>Tạo Khoản Trả Góp</button>}</div><section className="list-card">{plans.length === 0 ? <p className="empty-state">Chưa có khoản trả góp.</p> : plans.map((plan) => { const remaining = plan.total_amount - plan.total_paid; const progress = Math.min(100, Math.round((plan.total_paid / plan.total_amount) * 100)); return <article className="installment-block" key={plan.id}><div className="installment-row"><div><strong>{plan.name}</strong><span>Đã góp {formatVnd(plan.total_paid)} / {formatVnd(plan.total_amount)}</span><div className="progress"><i style={{ width: `${progress}%` }} /></div></div><strong>{formatVnd(remaining)}<small>còn lại</small></strong></div>{isAdmin&&<button className="secondary-button" onClick={()=>setShowPayment(plan.id)}>Ghi Nhận Lần Góp</button>}<div className="payment-history">{payments.filter(p=>p.plan_id===plan.id).map(p=><div key={p.id}><span>{formatDate(p.paid_at)} · {p.note||'Đã góp'}</span><strong>{formatVnd(p.amount)}</strong></div>)}</div></article>})}</section>
    {showCreate&&<Dialog title="Tạo Khoản Trả Góp" onClose={()=>setShowCreate(false)}><form className="form-stack" onSubmit={addPlan}><label>Tên Khoản<input required name="name"/></label><label>Tổng Tiền (VND)<input required name="amount" inputMode="numeric"/></label><button className="primary-button">Tạo Khoản Trả Góp</button></form></Dialog>}
    {showPayment&&<Dialog title="Ghi Nhận Lần Góp" onClose={()=>setShowPayment(null)}><form className="form-stack" onSubmit={addPayment}><label>Ngày Góp<input required type="date" name="paid_at" defaultValue={today}/></label><label>Số Tiền (VND)<input required name="amount" inputMode="numeric"/></label><label>Ghi Chú<input name="note"/></label><button className="primary-button">Lưu Lần Góp</button></form></Dialog>}
  </section>
}

function ReportsPanel({orders,payments,plans,cycles,ledgerEntries,closings,selected,onSelect,onUpdated,isAdmin}:{orders:Order[];payments:Payment[];plans:InstallmentPlan[];cycles:any[];ledgerEntries:any[];closings:any[];selected:string;onSelect:(v:string)=>void;onUpdated:()=>Promise<void>;isAdmin:boolean}){
  const cycle=cycles.find(c=>c.id===selected)??cycles[0]
  const cycleOrders=cycle?orders.filter(o=>o.billing_cycle_id===cycle.id):[]
  const purchases=cycleOrders.filter(o=>o.status!=='cancelled'&&!o.deleted_at).reduce((s,o)=>s+o.amount,0)
  const paid=payments.filter(p=>cycle&&p.paid_at>=cycle.starts_on&&p.paid_at<=cycle.ends_on).reduce((s,p)=>s+p.amount,0)
  const adjustments=ledgerEntries.filter(e=>e.billing_cycle_id===cycle?.id).reduce((s,e)=>s+e.amount,0)
  const opening=cycle?.opening_balance??0
  const snapshot=closings.find(c=>c.billing_cycle_id===cycle?.id&&c.is_current!==false)
  const ending=snapshot?.closing_balance??(opening+purchases-paid+adjustments)
  const exportCsv=()=>{
    const rows=[['Loại','Ngày','Nội dung','Số tiền (VND)','Trạng thái'],...cycleOrders.map(o=>['Đơn hàng',o.placed_at,o.description,String(o.amount),o.deleted_at?'Đã Xóa':o.status==='paid'?'Đã Trả':o.status==='cancelled'?'Đã Hủy':'Chưa Trả']),...payments.filter(p=>cycle&&p.paid_at>=cycle.starts_on&&p.paid_at<=cycle.ends_on).map(p=>['Thanh toán',p.paid_at,p.note??'',String(p.amount),'Đã nhận']),...ledgerEntries.filter(e=>e.billing_cycle_id===cycle?.id).map(e=>['Điều chỉnh',e.entry_date,e.description,String(e.amount),e.kind])]
    const excelEscape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
    const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Bao cao ${cycle?.label??''}"><Table>${rows.map(row=>`<Row>${row.map((cell,index)=>`<Cell><Data ss:Type="${index===3&&/^[-0-9]+$/.test(cell)?'Number':'String'}">${excelEscape(cell)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`
    const blob=new Blob([xml],{type:'application/vnd.ms-excel;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`bao-cao-${cycle?.label??'ky'}.xls`;link.click();URL.revokeObjectURL(link.href)
  }
  const pdf=()=>window.print()
  const toggleClose=async()=>{if(!supabase||!cycle)return;const {error}=await supabase.rpc(cycle.status==='closed'?'reopen_billing_cycle':'close_billing_cycle',{p_cycle_id:cycle.id});if(error)window.alert(error.message);else await onUpdated()}
  return <section className="content-stack report-panel"><div className="page-heading"><div><p className="eyebrow">Đối soát</p><h2>Báo cáo kỳ</h2></div><div className="report-actions"><button className="secondary-button" onClick={exportCsv}>Xuất Excel</button><button className="secondary-button" onClick={pdf}>Lưu PDF</button></div></div>{cycles.length===0?<section className="list-card empty-state">Chưa có kỳ sổ nào.</section>:<><label>Kỳ sổ<select value={cycle?.id??''} onChange={e=>onSelect(e.target.value)}>{cycles.map(c=><option key={c.id} value={c.id}>{c.label} · {c.status==='closed'?'Đã khóa':'Đang mở'}</option>)}</select></label><section className="metric-grid"><article className="metric"><span>Dư đầu kỳ</span><strong>{formatVnd(opening)}</strong></article><article className="metric"><span>Đơn phát sinh</span><strong>{formatVnd(purchases)}</strong></article><article className="metric"><span>Đã trả trong kỳ</span><strong>{formatVnd(paid)}</strong></article><article className="metric"><span>Còn lại theo kỳ</span><strong>{formatVnd(ending)}</strong></article></section><section className="list-card report-orders">{cycleOrders.length?cycleOrders.map(o=><div className={`report-line ${o.deleted_at?'is-deleted':''}`} key={o.id}><span>{formatDate(o.placed_at)} · {o.description}{o.deleted_at?' · Đã Xóa':''}</span><strong>{formatVnd(o.amount)}</strong></div>):<p className="empty-state">Kỳ này chưa có đơn hàng.</p>}{isAdmin&&<button className="primary-button compact" onClick={()=>void toggleClose()}>{cycle.status==='closed'?'Mở khóa kỳ':'Khóa sổ kỳ này'}</button>}{cycle.status==='closed'&&<p className="hint">Kỳ đã khóa. Báo cáo đọc số dư đã lưu tại thời điểm khóa.</p>}</section></>}</section>
}

function PaymentCard({ onClose }: { onClose: () => void }) {
  return <Dialog title="Thanh toán" onClose={onClose}><div className="payment-card">{paymentQrUrl ? <img src={paymentQrUrl} alt="Mã VietQR thanh toán" /> : <p className="form-message">QR chưa được cấu hình.</p>}<strong>{payeeName || 'Chưa cấu hình tên người nhận'}</strong><span>{payeeBank} · {payeeAccount || 'Chưa cấu hình số tài khoản'}</span><p className="payment-note">Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé.</p></div></Dialog>
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="dialog-heading"><h2>{title}</h2><button className="text-button" onClick={onClose}>Đóng</button></div>{children}</section></div>
}
