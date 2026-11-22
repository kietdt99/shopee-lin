import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, CircleX, CreditCard, Download, Eye, LogOut, Package, Plus, QrCode, ReceiptText, RotateCcw, Search, Pencil, Trash2, Users, X } from 'lucide-react'
import { formatDate, formatVnd } from './lib/format'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { ProfileAvatar } from './ProfileAvatar'
import defaultAvatar from './avatar-default.svg'
import type { InstallmentPlan, Order, Payment, PaymentSettings, Profile } from './types'

type Tab = 'overview' | 'orders' | 'installments' | 'reports' | 'accounts' | 'payment-settings'

const validTabs: Tab[] = ['overview', 'orders', 'installments', 'reports', 'accounts', 'payment-settings']

function tabFromUrl(url: URL): Tab {
  const value = url.searchParams.get('tab')
  return validTabs.includes(value as Tab) ? value as Tab : 'overview'
}

function urlForTab(tab: Tab) {
  const url = new URL(window.location.href)
  if (tab === 'overview') url.searchParams.delete('tab')
  else url.searchParams.set('tab', tab)
  return `${url.pathname}${url.search}${url.hash}`
}

const payeeName = import.meta.env.VITE_PAYEE_NAME ?? ''
const payeeAccount = import.meta.env.VITE_PAYEE_ACCOUNT ?? ''
const payeeBank = import.meta.env.VITE_PAYEE_BANK ?? 'TPB'

const fallbackPaymentQrUrl = payeeName && payeeAccount
  ? `https://img.vietqr.io/image/${payeeBank}-${payeeAccount}-compact.png?accountName=${encodeURIComponent(payeeName)}`
  : ''
const defaultPaymentNote = 'Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé 😘'
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
      { role: 'Admin', displayName: 'Bé Kịt Thần Kỳ', email: import.meta.env.VITE_LOCAL_ADMIN_EMAIL ?? '' },
      { role: 'Viewer', displayName: 'Tester Quèn', email: import.meta.env.VITE_LOCAL_VIEWER_EMAIL ?? '' },
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
const cycleDisplay = (cycle: { label: string; starts_on: string; ends_on: string }) => `${cycle.label} (${formatDate(cycle.starts_on)} – ${formatDate(cycle.ends_on)})`
function cycleFilterSummary(selection: string[] | null, cycles: { id: string; label: string }[]) {
  if (selection === null || selection.length === 0) return 'Tất Cả'
  if (selection.length === 1) return cycles.find((cycle) => cycle.id === selection[0])?.label ?? '1 mục'
  return `${selection.length} mục`
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
    ? 'Liên kết khôi phục đã hết hạn. Nhắn bé Kịt tạo liên kết mới nhé.'
    : '')
  const [passwordSetup, setPasswordSetup] = useState(() => new URLSearchParams(window.location.search).has('set-password'))
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({ singleton: true, note: defaultPaymentNote, qr_image_path: null, updated_at: '', updated_by: null })
  const [paymentQrUrl, setPaymentQrUrl] = useState(fallbackPaymentQrUrl)
  const [plans, setPlans] = useState<InstallmentPlan[]>([])
  const [tab, setTab] = useState<Tab>(() => tabFromUrl(new URL(window.location.href)))
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

  const navigateToTab = (nextTab: Tab) => {
    if ((nextTab === 'accounts' || nextTab === 'payment-settings') && !isAdmin) return
    setTab(nextTab)
    const nextUrl = urlForTab(nextTab)
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl !== currentUrl) window.history.pushState(window.history.state, '', nextUrl)
  }

  useEffect(() => {
    const restoreTabFromUrl = () => {
      const currentUrl = new URL(window.location.href)
      const requestedTab = tabFromUrl(currentUrl)
      const adminOnlyTab = requestedTab === 'accounts' || requestedTab === 'payment-settings'
      const nextTab = adminOnlyTab && !loading && !isAdmin ? 'overview' : requestedTab
      setTab(nextTab)

      const rawTab = currentUrl.searchParams.get('tab')
      const hasInvalidOrDefaultTab = rawTab !== null && (!validTabs.includes(rawTab as Tab) || nextTab === 'overview')
      if (nextTab !== requestedTab || hasInvalidOrDefaultTab) {
        window.history.replaceState(window.history.state, '', urlForTab(nextTab))
      }
    }

    window.addEventListener('popstate', restoreTabFromUrl)
    restoreTabFromUrl()
    return () => window.removeEventListener('popstate', restoreTabFromUrl)
  }, [isAdmin, loading])

  const outstanding = useMemo(
    () => {
      const activeOrders = orders.filter((order) => order.status !== 'cancelled' && !order.deleted_at)
      // A cancelled order no longer contributes its purchase amount, but retained payment allocations remain credits.
      const nonDeletedOrderIds = new Set(orders.filter((order) => !order.deleted_at).map((order) => order.id))
      const retainedAllocations = allocations.filter((allocation) => nonDeletedOrderIds.has(allocation.order_id))
      return Math.max(0, activeOrders.reduce((total, order) => total + order.amount, 0) - retainedAllocations.reduce((total, allocation) => total + allocation.amount, 0) + ledgerEntries.reduce((total, entry) => total + entry.amount, 0))
    },
    [orders, allocations, ledgerEntries],
  )
  const loadData = async () => {
    if (!client) return
    const { data: sessionData } = await client.auth.getSession()
    const user = sessionData.session?.user
    if (!user) {
      setProfile(null)
      setPaymentSettings({ singleton: true, note: defaultPaymentNote, qr_image_path: null, updated_at: '', updated_by: null })
      setPaymentQrUrl(fallbackPaymentQrUrl)
      setLoading(false)
      return
    }

    const [profileResult, accountResult, orderResult, paymentResult, planResult, cycleResult, installmentPaymentResult, allocationResult, ledgerResult, closingResult, paymentSettingsResult] = await Promise.all([
      client.from('profiles').select('id,email,full_name,role,avatar_path').eq('id', user.id).single(),
      client.from('profiles').select('id,email,full_name,role').order('role').order('full_name'),
      client.from('orders').select('id,placed_at,description,notes,shopee_order_url,amount,status,billing_cycle_id,deleted_at').order('placed_at', { ascending: false }),
      client.from('payments').select('id,paid_at,amount,note').order('paid_at', { ascending: false }),
      client.from('installment_summary').select('id,name,total_amount,total_paid'),
      client.from('billing_cycles').select('*').order('starts_on', { ascending: false }),
      client.from('installment_payments').select('*').order('paid_at', { ascending: false }),
      client.from('payment_allocations').select('payment_id,order_id,amount'),
      client.from('ledger_entries').select('*'),
      client.from('cycle_closings').select('*'),
      client.from('payment_settings').select('singleton,note,qr_image_path,updated_at,updated_by').eq('singleton', true).maybeSingle(),
    ])

    if (profileResult.error) {
      setMessage('Tài khoản này chưa được cấp quyền. Hãy liên hệ bé Kịt.')
      setProfile(null)
    } else {
      setProfile(profileResult.data as Profile)
      const loadedPaymentSettings = (paymentSettingsResult.data as PaymentSettings | null) ?? {
        singleton: true,
        note: defaultPaymentNote,
        qr_image_path: null,
        updated_at: '',
        updated_by: null,
      }
      setPaymentSettings(loadedPaymentSettings)
      if (loadedPaymentSettings.qr_image_path) {
        const { data: signedQr, error: signedQrError } = await client.storage.from('payment-qr').createSignedUrl(loadedPaymentSettings.qr_image_path, 60 * 60 * 24)
        setPaymentQrUrl(signedQrError ? '' : (signedQr?.signedUrl ?? ''))
      } else {
        setPaymentQrUrl(fallbackPaymentQrUrl)
      }
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
    setMessage(error ? 'Email hoặc mật khẩu chưa đúng.' : '')
  }

  const signInAsLocal = async (account: { role: string; displayName: string; email: string }) => {
    if (!client || !localSupabaseUrl || !import.meta.env.VITE_LOCAL_DEV_PASSWORD) return
    setEmail(account.email)
    setPassword('')
    setMessage(`Đang đăng nhập với ${account.displayName}…`)
    const { error } = await client.auth.signInWithPassword({ email: account.email, password: import.meta.env.VITE_LOCAL_DEV_PASSWORD })
    setMessage(error ? `Đăng nhập ${account.displayName} chưa thành công. Hãy khởi động lại Supabase cục bộ.` : '')
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
      setMessage(error.message.toLowerCase().includes('rate limit')
        ? 'Đã vượt giới hạn gửi email tạm thời. Hãy thử lại sau.'
        : 'Không gửi được liên kết kích hoạt. Hãy thử lại sau hoặc liên hệ bé Kịt.')
    } else setMessage('Đã gửi liên kết. Mở email trên trình duyệt này để đặt mật khẩu một lần.')
  }

  const startPasswordReset = async () => {
    if (!client || !email) return setMessage('Nhập email trước nhé.')
    setMessage('Đang gửi liên kết đặt lại mật khẩu…')
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    })
    setMessage(error
      ? error.message.toLowerCase().includes('rate limit')
        ? 'Đã vượt giới hạn gửi email tạm thời. Hãy thử lại sau.'
        : 'Không gửi được liên kết đặt lại mật khẩu. Hãy thử lại sau hoặc liên hệ bé Kịt.'
      : 'Nếu email đã được cấp quyền, liên kết đặt lại mật khẩu sẽ được gửi tới hộp thư.')
  }

  const updatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!client) return
    if (password.length < 8) return setMessage('Mật khẩu cần ít nhất 8 ký tự.')
    const { error } = await client.auth.updateUser({ password })
    if (error) return setMessage('Không thể cập nhật mật khẩu. Hãy thử lại hoặc liên hệ bé Kịt.')
    localStorage.removeItem('shopee-lin-password-setup')
    setPasswordSetup(false)
    setPassword('')
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.delete('set-password')
    const cleanPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
    window.history.replaceState(window.history.state, '', cleanPath)
    setMessage('Đã đặt mật khẩu. Từ lần sau, đăng nhập bằng email và mật khẩu.')
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
        <button className="brand-link" type="button" onClick={() => navigateToTab('overview')}>
          <span className="brand-mark" aria-hidden="true">S</span><span>ShopeeLin</span>
        </button>
        <nav className="tabs" aria-label="Điều hướng">
          <TabButton active={tab === 'overview'} onClick={() => navigateToTab('overview')} icon={<ReceiptText size={18} />} label="Tổng Quan" />
          <TabButton active={tab === 'orders'} onClick={() => navigateToTab('orders')} icon={<Package size={18} />} label="Đơn Hàng" />
          <TabButton active={tab === 'installments'} onClick={() => navigateToTab('installments')} icon={<CreditCard size={18} />} label="Trả Góp" />
          <TabButton active={tab === 'reports'} onClick={() => navigateToTab('reports')} icon={<ReceiptText size={18} />} label="Báo Cáo" />
          {isAdmin && <TabButton active={tab === 'accounts'} onClick={() => navigateToTab('accounts')} icon={<Users size={18} />} label="Tài Khoản" />}
          {isAdmin && <TabButton active={tab === 'payment-settings'} onClick={() => navigateToTab('payment-settings')} icon={<QrCode size={18} />} label="Thanh Toán" />}
        </nav>
        <div className="sidebar-footer">
          <SidebarProfile profile={profile} onEdit={() => setShowDisplayName(true)} onSignOut={() => void signOut()} />
          <span className="app-version">v0.1.0</span>
        </div>
      </aside>

      <div className="main-area">
        {tab === 'overview' && <Overview outstanding={outstanding} plans={plans} isAdmin={isAdmin} onPay={() => setShowPayCard(true)} />}
      {tab === 'orders' && <OrdersPanel orders={orders} allocations={allocations} cycles={cycles} isAdmin={isAdmin} onUpdated={loadData} />}
        {tab === 'installments' && <InstallmentsPanel plans={plans} isAdmin={isAdmin} onUpdated={loadData} />}
        {tab === 'reports' && <ReportsPanel orders={orders} payments={payments} plans={plans} cycles={cycles} ledgerEntries={ledgerEntries} closings={closings} selected={reportCycle} onSelect={setReportCycle} onUpdated={loadData} isAdmin={isAdmin} />}
        {tab === 'accounts' && isAdmin && <AccountsPanel accounts={accounts} />}
        {tab === 'payment-settings' && isAdmin && <PaymentSettingsPanel settings={paymentSettings} currentImageUrl={paymentQrUrl} onSaved={loadData} />}
      </div>

      {showPayCard && <PaymentCard imageUrl={paymentQrUrl} note={paymentSettings.note} onClose={() => setShowPayCard(false)} />}
      {showDisplayName && <DisplayNameDialog profile={profile} onClose={() => setShowDisplayName(false)} onSaved={loadData} />}
    </main>
  )
}

function SidebarProfile({ profile, onEdit, onSignOut }: { profile: Profile; onEdit: () => void; onSignOut: () => void }) {
  const [avatarUrl, setAvatarUrl] = useState('')

  useEffect(() => {
    let active = true
    setAvatarUrl('')
    if (!supabase || !profile.avatar_path) return () => { active = false }
    void supabase.storage.from('profile-avatars').createSignedUrl(profile.avatar_path, 1800).then(({ data, error }) => {
      if (active && !error) setAvatarUrl(data.signedUrl)
    })
    return () => { active = false }
  }, [profile.avatar_path])

  return <section className="sidebar-profile" aria-label="Hồ Sơ">
    <img className="sidebar-avatar" src={avatarUrl || defaultAvatar} alt={`Ảnh đại diện ${profile.full_name}`} />
    <div className="sidebar-profile-meta">
      <strong className="sidebar-profile-name">{profile.full_name}</strong>
      <span className="sidebar-profile-role">{profile.role === 'admin' ? 'Admin' : 'Viewer'}</span>
    </div>
    <div className="sidebar-profile-actions">
      <button className="sidebar-action sidebar-action-profile" aria-label="Hồ Sơ" onClick={onEdit}><Pencil size={15} />Hồ Sơ</button>
      <button className="sidebar-action" aria-label="Đăng Xuất" onClick={onSignOut}><LogOut size={15} />Đăng Xuất</button>
    </div>
  </section>
}

function ConfigurationNotice() {
  return <main className="centered"><section className="auth-card"><h1>Cần cấu hình Supabase</h1><p>Thêm Project URL và Publishable key vào file <code>.env.local</code> để chạy ứng dụng.</p></section></main>
}

function Login({ email, password, message, localAccounts, onLoginAsLocal, onEmailChange, onPasswordChange, onSubmit, onSetup, onReset }: { email: string; password: string; message: string; localAccounts: { role: string; displayName: string; email: string }[]; onLoginAsLocal: (account: { role: string; displayName: string; email: string }) => void; onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onSetup: () => void; onReset: () => void }) {
  if (localAccounts.length > 0) {
    return <main className="centered"><section className="auth-card"><p className="eyebrow">ShopeeLin · Dùng Thử</p><h1>Chọn Tài Khoản</h1><p>Chọn một tài khoản để kiểm tra quyền và giao diện.</p><section className="local-login-picker" aria-label="Tài Khoản Dùng Thử"><div className="local-login-options">{localAccounts.map((account) => <button className="local-login-option" data-testid={`local-login-${account.role === 'Admin' ? 'admin' : 'tester'}`} key={account.email} type="button" onClick={() => onLoginAsLocal(account)}><strong>{account.role}</strong><span>{account.displayName}</span></button>)}</div><p className="local-login-hint">Chỉ kết nối Supabase cục bộ; không đăng nhập vào bản chính thức.</p></section>{message && <p className="form-message">{message}</p>}</section></main>
  }
  return <main className="centered"><section className="auth-card"><p className="eyebrow">ShopeeLin</p><h1>Bé Lin</h1><p>Đăng nhập bằng email và mật khẩu.</p><form onSubmit={onSubmit}><label>Email<input required type="email" autoComplete="username" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="email@example.com" /></label><label>Mật Khẩu<input required type="password" autoComplete="current-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label><button className="primary-button" type="submit">Đăng nhập</button></form><div className="auth-links"><button className="text-button" type="button" onClick={onSetup}>Đặt mật khẩu lần đầu</button><button className="text-button" type="button" onClick={onReset}>Quên mật khẩu?</button></div>{message && <p className="form-message">{message}</p>}</section></main>
}

function PasswordSetup({ email, password, message, onPasswordChange, onSubmit }: { email: string; password: string; message: string; onPasswordChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <main className="centered"><section className="auth-card"><p className="eyebrow">Thiết Lập Tài Khoản</p><h1>Đặt Mật Khẩu</h1><p>{email ? `Tài khoản ${email}` : 'Tạo mật khẩu để lần sau đăng nhập không cần mở email.'}</p><form onSubmit={onSubmit}><label>Mật Khẩu Mới<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label><button className="primary-button" type="submit">Lưu Mật Khẩu</button></form>{message && <p className="form-message">{message}</p>}</section></main>
}

function AccountsPanel({ accounts }: { accounts: Profile[] }) {
  const [resetting, setResetting] = useState<Profile | null>(null)
  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Admin</p><h2>Quản Lý Tài Khoản</h2></div></div><p className="hint">Tạo liên kết dùng một lần để người dùng đặt mật khẩu mới. Liên kết không gửi email và hết hạn sau 5 phút.</p><section className="list-card">{accounts.length === 0 ? <p className="empty-state">Chưa có tài khoản nào.</p> : accounts.map((account) => <article className="account-row" key={account.id}><div className="order-details"><strong>{account.full_name}</strong><span>{account.email} · {account.role === 'admin' ? 'Admin' : 'Người Xem'}</span></div>{account.role === 'viewer' && <button className="secondary-button" onClick={() => setResetting(account)}>Đặt Lại Mật Khẩu</button>}</article>)}</section>{resetting && <RecoveryLinkDialog account={resetting} onClose={() => setResetting(null)} />}</section>
}

function PaymentSettingsPanel({ settings, currentImageUrl, onSaved }: { settings: PaymentSettings; currentImageUrl: string; onSaved: () => Promise<void> }) {
  const [note, setNote] = useState(settings.note)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [pendingUploadedPath, setPendingUploadedPath] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl('')
      return
    }
    const objectUrl = URL.createObjectURL(imageFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [imageFile])

  const selectImage = async (file: File | undefined) => {
    setError('')
    setPendingUploadedPath(null)
    if (!file) {
      setImageFile(null)
      return
    }

    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!supportedTypes.includes(file.type)) {
      setImageFile(null)
      setError('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setImageFile(null)
      setError('Ảnh QR không được vượt quá 2 MB.')
      return
    }

    try {
      const image = await createImageBitmap(file)
      const isReadable = image.width >= 128 && image.height >= 128
      image.close()
      if (!isReadable) {
        setImageFile(null)
        setError('Ảnh quá nhỏ để hiển thị rõ. Hãy chọn ảnh có chiều rộng và cao tối thiểu 128 px.')
        return
      }
    } catch {
      setImageFile(null)
      setError('Không đọc được ảnh này. Hãy chọn một tệp ảnh hợp lệ.')
      return
    }

    setImageFile(file)
  }

  const saveSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return setError('Supabase chưa được cấu hình.')
    const cleanNote = note.trim()
    if (!cleanNote || cleanNote.length > 300) return setError('Nhập ghi chú từ 1 đến 300 ký tự.')

    setBusy(true)
    setError('')
    let qrImagePath = pendingUploadedPath ?? settings.qr_image_path

    if (imageFile && !pendingUploadedPath) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (sessionError || !userId) {
        setBusy(false)
        return setError('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.')
      }

      const extensionByType: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
      const imagePath = `${userId}/${crypto.randomUUID()}.${extensionByType[imageFile.type]}`
      const { error: uploadError } = await supabase.storage.from('payment-qr').upload(imagePath, imageFile, {
        cacheControl: '31536000',
        contentType: imageFile.type,
        upsert: false,
      })
      if (uploadError) {
        setBusy(false)
        return setError('Không tải được ảnh QR. Hãy kiểm tra quyền truy cập và thử lại.')
      }
      qrImagePath = imagePath
      setPendingUploadedPath(imagePath)
    }

    const { error: saveError } = await supabase.rpc('update_payment_settings', {
      p_note: cleanNote,
      p_qr_image_path: qrImagePath,
    })
    if (saveError) {
      setBusy(false)
      return setError('Không lưu được thiết lập thanh toán. Hãy thử lại.')
    }

    await onSaved()
    setImageFile(null)
    setPendingUploadedPath(null)
    setBusy(false)
  }

  return <section className="content-stack payment-settings-panel">
    <div className="page-heading"><div><p className="eyebrow">Admin</p><h2>Thiết Lập Thanh Toán</h2></div></div>
    <section className="section-card">
      <form className="form-stack" onSubmit={saveSettings}>
        <label className="payment-image-label">Ảnh QR Thanh Toán<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectImage(event.target.files?.[0])} /></label>
        <p className="hint">Ảnh được hiển thị nguyên bản cho Viewer. Hệ thống chỉ kiểm tra định dạng, dung lượng và khả năng đọc tệp; không giải mã hay kiểm tra đích nhận tiền trong QR.</p>
        {(previewUrl || currentImageUrl) && <img className="payment-settings-preview" src={previewUrl || currentImageUrl} alt="Xem trước ảnh QR thanh toán" />}
        <label><span className="label-title"><span className="label-copy">Ghi Chú Thanh Toán</span><span className="required-marker" aria-hidden="true">*</span></span><textarea required maxLength={300} rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        {error && <p className="form-message" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Đang Lưu…' : 'Lưu Thay Đổi'}</button>
      </form>
    </section>
  </section>
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
    if (invokeError) return setError('Không thể tạo liên kết khôi phục. Hãy thử lại hoặc liên hệ bé Kịt.')
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

  return <Dialog title="Đặt Lại Mật Khẩu" onClose={onClose}><div className="form-stack"><p>Tài khoản: <strong>{account.full_name}</strong> · {account.email}</p>{!link && <><p className="hint">Tạo liên kết đặt lại mật khẩu dùng một lần. Liên kết không gửi email; hãy gửi riêng cho người dùng.</p><button className="primary-button" type="button" disabled={loading} onClick={() => void createLink()}>{loading ? 'Đang tạo liên kết…' : 'Tạo Liên Kết'}</button></>}{error && <p className="form-message">{error}</p>}{link && <><label>Liên Kết Khôi Phục<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label><div className="recovery-link-actions"><span className={remaining === 0 ? 'expired' : 'hint'}>{remaining === 0 ? 'Liên kết đã hết hạn' : `Hết hạn sau ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</span><button className="primary-button compact" type="button" disabled={remaining === 0} onClick={() => void copyLink()}>{copied ? 'Đã Sao Chép' : 'Sao Chép Liên Kết'}</button></div><p className="hint">Gửi liên kết riêng cho người dùng. Liên kết chỉ dùng một lần; khi mở, người dùng sẽ đặt mật khẩu mới. Đóng cửa sổ sẽ xóa liên kết khỏi ứng dụng.</p></>}</div></Dialog>
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
    if (updateError) return setError('Không thể lưu hồ sơ. Hãy kiểm tra thông tin rồi thử lại.')
    await onSaved()
    onClose()
  }
  return <Dialog title="Hồ Sơ" onClose={onClose}><form className="form-stack" onSubmit={save}><ProfileAvatar userId={profile.id} avatarPath={avatarPath} displayName={displayName} onPathChange={setAvatarPath} /><label><span className="label-title"><span className="label-copy">Tên Hiển Thị</span><span className="required-marker" aria-hidden="true">*</span></span><input required aria-required="true" maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Email<input className="readonly-input" type="email" readOnly aria-readonly="true" value={profile.email} /></label>{error && <p className="form-message">{error}</p>}<button className="primary-button" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu Thay Đổi'}</button></form></Dialog>
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}

function Overview({ outstanding, plans, isAdmin, onPay }: { outstanding: number; plans: InstallmentPlan[]; isAdmin: boolean; onPay: () => void }) {
  const installmentRemaining = plans.reduce((total, plan) => total + plan.total_amount - plan.total_paid, 0)
  const currentCycle = { label: cycleLabel(today), ...cycleRange(cycleLabel(today)) }
  return <section className="content-stack">
    <section className="balance-card"><p>Dư nợ Shopee hiện tại</p><strong>{formatVnd(outstanding)}</strong><span>Cập nhật từ các đơn chưa thanh toán</span>{!isAdmin && <button className="light-button" onClick={onPay}><QrCode size={18} />Thanh toán</button>}</section>
    <section className="metric-grid metric-grid-single"><article className="metric"><span>Còn trả góp</span><strong>{formatVnd(installmentRemaining)}</strong></article></section>
    <section className="section-card"><div className="section-heading"><div><p className="overview-cycle-label">Kỳ Hiện Tại</p><h2>{cycleDisplay(currentCycle)}</h2></div></div><p>{isAdmin ? 'Thêm đơn hàng hoặc ghi nhận khoản Bé Lin đã trả ở tab Đơn hàng.' : 'Theo dõi các đơn chưa trả và dùng QR khi cần thanh toán.'}</p></section>
  </section>
}

type OrderFilterStatus = 'unpaid' | 'paid' | 'cancelled' | 'deleted'
type OrderSortKey = 'date' | 'amount' | 'cycle' | 'status'
type OrderSortDirection = 'asc' | 'desc'

const orderStatusSortOrder: Record<OrderFilterStatus, number> = { unpaid: 0, paid: 1, cancelled: 2, deleted: 3 }

function orderStatus(order: Order): OrderFilterStatus {
  if (order.deleted_at) return 'deleted'
  if (order.status === 'cancelled') return 'cancelled'
  if (order.status === 'paid') return 'paid'
  return 'unpaid'
}

function compareOrderValues(left: Order, right: Order, key: OrderSortKey, cycleStartById: Map<string, string>) {
  switch (key) {
    case 'date':
      return left.placed_at.localeCompare(right.placed_at)
    case 'amount':
      return left.amount - right.amount
    case 'cycle': {
      const leftCycleStart = left.billing_cycle_id ? cycleStartById.get(left.billing_cycle_id) : undefined
      const rightCycleStart = right.billing_cycle_id ? cycleStartById.get(right.billing_cycle_id) : undefined
      if (leftCycleStart === undefined || rightCycleStart === undefined) {
        if (leftCycleStart !== rightCycleStart) return leftCycleStart === undefined ? 1 : -1
        return 0
      }
      return leftCycleStart.localeCompare(rightCycleStart)
    }
    case 'status':
      return orderStatusSortOrder[orderStatus(left)] - orderStatusSortOrder[orderStatus(right)]
  }
}

function sortOrders(orders: Order[], key: OrderSortKey | null, direction: OrderSortDirection, cycleStartById: Map<string, string>) {
  if (key === null) return orders

  const directionMultiplier = direction === 'asc' ? 1 : -1
  return orders.map((order, index) => ({ order, index })).sort((left, right) => {
    if (key === 'cycle') {
      const leftHasCycleDate = left.order.billing_cycle_id !== null && cycleStartById.has(left.order.billing_cycle_id)
      const rightHasCycleDate = right.order.billing_cycle_id !== null && cycleStartById.has(right.order.billing_cycle_id)
      if (leftHasCycleDate !== rightHasCycleDate) return leftHasCycleDate ? -1 : 1
    }

    const comparison = compareOrderValues(left.order, right.order, key, cycleStartById)
    if (comparison === 0) return left.index - right.index
    return comparison * directionMultiplier
  }).map(({ order }) => order)
}

function OrderSortIcon({ active, direction }: { active: boolean; direction: OrderSortDirection }) {
  if (!active) return <ArrowUpDown size={14} aria-hidden="true" />
  return direction === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />
}

function OrderSortHeader({ field, label, active, direction, onSort, className = '' }: { field: OrderSortKey; label: string; active: boolean; direction: OrderSortDirection; onSort: (field: OrderSortKey) => void; className?: string }) {
  const ariaSort = !active ? 'none' : direction === 'asc' ? 'ascending' : 'descending'
  const directionLabel = direction === 'asc' ? 'Tăng Dần' : 'Giảm Dần'
  const buttonLabel = active ? `Sắp Xếp Theo ${label}, ${directionLabel}` : `Sắp Xếp Theo ${label}`

  return <th className={`orders-sort-heading ${className}`} aria-sort={ariaSort}>
    <button type="button" className="orders-sort-button" aria-label={buttonLabel} onClick={() => onSort(field)}>
      {label}<OrderSortIcon active={active} direction={direction} />
    </button>
  </th>
}

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

function shortenOrderDescription(description: string, maxLength = 88) {
  const text = description.replace(/\s+/g, ' ').trim()
  const characters = Array.from(text)
  return characters.length > maxLength ? `${characters.slice(0, maxLength - 1).join('').trimEnd()}…` : text
}

function OrdersPanel({ orders, allocations, cycles, isAdmin, onUpdated }: { orders: Order[]; allocations: any[]; cycles: { id: string; label: string; starts_on: string; ends_on: string; status?: 'open' | 'closed' }[]; isAdmin: boolean; onUpdated: () => Promise<void> }) {
  const filterControlsRef = useRef<HTMLDivElement>(null)
  const searchFormRef = useRef<HTMLFormElement>(null)
  const [pendingOrderAction, setPendingOrderAction] = useState<{ type: 'delete' | 'restore' | 'cancel'; order: Order } | null>(null)
  const [notice, setNotice] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false)
  const [activeSearchSuggestion, setActiveSearchSuggestion] = useState(-1)
  const [cycleSearch, setCycleSearch] = useState('')
  // loadData sorts cycles newest-first, so a newly opened Orders tab starts on the latest cycle.
  const defaultCycleSelection = cycles[0] ? [cycles[0].id] : []
  const [pendingCycles, setPendingCycles] = useState<string[] | null>(() => [...defaultCycleSelection])
  const [pendingStatuses, setPendingStatuses] = useState<OrderFilterStatus[] | null>([])
  const [appliedCycles, setAppliedCycles] = useState<string[] | null>(() => [...defaultCycleSelection])
  const [appliedStatuses, setAppliedStatuses] = useState<OrderFilterStatus[] | null>(null)
  const [sortKey, setSortKey] = useState<OrderSortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const controls = filterControlsRef.current
      if (controls && !controls.contains(event.target as Node)) controls.querySelectorAll('details[open]').forEach((item) => item.removeAttribute('open'))
      if (!searchFormRef.current?.contains(event.target as Node)) {
        setSearchSuggestionsOpen(false)
        setActiveSearchSuggestion(-1)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const openFilter = filterControlsRef.current?.querySelector('details[open]')
      if (!openFilter) return
      openFilter.removeAttribute('open')
      openFilter.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])
  const remainingFor = (order: Order) => order.amount - allocations.filter((allocation) => allocation.order_id === order.id).reduce((sum, allocation) => sum + allocation.amount, 0)
  const allocatedFor = (order: Order) => allocations.filter((allocation) => allocation.order_id === order.id).reduce((sum, allocation) => sum + allocation.amount, 0)
  const statusFor = orderStatus
  const cycleIsClosed = (order: Order) => cycles.some((cycle) => cycle.id === order.billing_cycle_id && cycle.status === 'closed')
  const unpaid = orders.filter((order) => statusFor(order) === 'unpaid' && !cycleIsClosed(order))
  const selectedOrders = unpaid.filter((order) => selected.includes(order.id))
  const selectedAmount = selectedOrders.reduce((total, order) => total + remainingFor(order), 0)
  const cycleLabels = new Map(cycles.map((cycle) => [cycle.id, cycle.label]))
  const statusLabels: Record<OrderFilterStatus, string> = { unpaid: 'Chưa Thanh Toán', paid: 'Đã Thanh Toán', cancelled: 'Đã Hủy', deleted: 'Đã Xóa' }
  const statuses = new Set<OrderFilterStatus>(orders.map(statusFor))
  if (isAdmin) statuses.add('deleted')
  const availableStatuses = Object.keys(statusLabels).filter((value) => statuses.has(value as OrderFilterStatus)) as OrderFilterStatus[]
  const matchingCycles = cycles.filter((cycle) => cycle.label.toLocaleLowerCase('vi').includes(cycleSearch.trim().toLocaleLowerCase('vi')))
  const filteredOrders = orders.filter((order) => {
    const matchesSearch = !appliedSearch || order.description.toLocaleLowerCase('vi').includes(appliedSearch.toLocaleLowerCase('vi'))
    const matchesCycle = !appliedCycles?.length || appliedCycles.includes(order.billing_cycle_id ?? '')
    const matchesStatus = !appliedStatuses?.length || appliedStatuses.includes(statusFor(order))
    return matchesSearch && matchesCycle && matchesStatus
  })
  const cycleStartById = new Map(cycles.map((cycle) => [cycle.id, cycle.starts_on]))
  const sortedOrders = sortOrders(filteredOrders, sortKey, sortDirection, cycleStartById)
  const searchSuggestions = useMemo(() => {
    const query = searchInput.trim().toLocaleLowerCase('vi')
    if (!query) return []
    const seen = new Set<string>()
    return orders.filter((order) => order.description.toLocaleLowerCase('vi').includes(query)).filter((order) => {
      const key = order.description.trim().toLocaleLowerCase('vi')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 6)
  }, [orders, searchInput])

  const toggleOrder = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleFilterValue = <T extends string>(selection: T[] | null, value: T, allValues: T[], update: (next: T[] | null) => void) => {
    const selected = selection ?? [...allValues]
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]
    update(next.length === allValues.length ? null : next)
  }
  const allSelected = <T extends string>(selection: T[] | null, allValues: T[]) => selection === null || (allValues.length > 0 && selection.length === allValues.length)
  const toggleSort = (key: OrderSortKey) => {
    if (sortKey === key) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDirection('asc') }
  }
  const chooseMobileSort = (value: string) => {
    const nextKey = value as OrderSortKey | ''
    setSortKey(nextKey || null)
    if (nextKey) setSortDirection('asc')
  }
  const applyFilters = () => {
    const nextCycles = pendingCycles === null || pendingCycles.length === 0 ? null : pendingCycles
    const nextStatuses = pendingStatuses === null || pendingStatuses.length === 0 ? null : pendingStatuses
    setAppliedCycles(nextCycles)
    setAppliedStatuses(nextStatuses)
    setCycleSearch('')
    filterControlsRef.current?.querySelectorAll('details[open]').forEach((item) => item.removeAttribute('open'))
  }
  const selectSearchSuggestion = (order: Order) => {
    setSearchInput(order.description)
    setAppliedSearch(order.description.trim())
    setSearchSuggestionsOpen(false)
    setActiveSearchSuggestion(-1)
  }
  const markPaid = async () => {
    if (!supabase || selectedOrders.length === 0) return
    setBusy(true)
    const { error } = await supabase.rpc('record_order_payment', { p_order_ids: selectedOrders.map((order) => order.id), p_amount: selectedAmount, p_paid_at: today, p_note: 'Admin xác nhận thanh toán' })
    if (error) setNotice('Không thể ghi nhận thanh toán. Hãy kiểm tra trạng thái các đơn rồi thử lại.')
    else { setSelected([]); setShowPaymentConfirm(false) }
    setBusy(false)
    await onUpdated()
  }
  const softDeleteOrder = async (order: Order) => {
    setPendingOrderAction({ type: 'delete', order })
  }
  const confirmSoftDelete = async () => {
    const order = pendingOrderAction?.order
    if (!supabase || !order) return
    setBusy(true)
    const { error } = await supabase.rpc('soft_delete_order', { p_order_id: order.id })
    setPendingOrderAction(null)
    setBusy(false)
    if (error) setNotice('Không thể đánh dấu đơn đã xóa. Hãy kiểm tra trạng thái đơn và kỳ sổ rồi thử lại.')
    else { setSelected((current) => current.filter((id) => id !== order.id)); await onUpdated() }
  }
  const restoreOrder = async (order: Order) => {
    setPendingOrderAction({ type: 'restore', order })
  }
  const confirmRestore = async () => {
    const order = pendingOrderAction?.order
    if (!supabase || !order) return
    setBusy(true)
    const { error } = await supabase.rpc('restore_deleted_order', { p_order_id: order.id })
    setPendingOrderAction(null)
    setBusy(false)
    if (error) setNotice('Không thể khôi phục đơn. Hãy kiểm tra trạng thái kỳ sổ rồi thử lại.'); else await onUpdated()
  }
  const cancelOrder = async (order: Order) => {
    setCancelError('')
    setPendingOrderAction({ type: 'cancel', order })
  }
  const confirmCancel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const order = pendingOrderAction?.order
    if (!supabase || !order || pendingOrderAction?.type !== 'cancel') return
    const allocated = allocatedFor(order)
    const form = new FormData(event.currentTarget)
    const refundValue = allocated > 0 ? parseVndInput(String(form.get('refund') ?? '')) : 0
    if (refundValue === null || refundValue < 0 || refundValue > allocated) return setCancelError('Số tiền hoàn phải là số nguyên không âm và không vượt quá tiền đã phân bổ.')
    setBusy(true)
    const { error } = await supabase.rpc('cancel_order', { p_order_id: order.id, p_refund_amount: refundValue, p_note: `Hoàn tiền đơn ${order.description}` })
    setBusy(false)
    if (error) setCancelError('Không thể ghi nhận hủy hoặc hoàn tiền. Hãy kiểm tra lại trạng thái đơn và số tiền hoàn.')
    else { setPendingOrderAction(null); await onUpdated() }
  }

  return <section className="content-stack">
    <div className="page-heading orders-page-heading"><div><h2>Đơn Hàng</h2></div></div>
    <section className="order-tools">
      <form className="order-search" role="search" ref={searchFormRef} onSubmit={(event) => { event.preventDefault(); setAppliedSearch(searchInput.trim()); setSearchSuggestionsOpen(false); setActiveSearchSuggestion(-1) }}>
        <input aria-label="Tìm Kiếm Đơn Hàng" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={searchSuggestionsOpen && searchSuggestions.length > 0} aria-controls={searchSuggestionsOpen && searchSuggestions.length > 0 ? 'order-search-suggestions' : undefined} aria-activedescendant={activeSearchSuggestion >= 0 ? `order-search-suggestion-${activeSearchSuggestion}` : undefined} placeholder="Tìm Kiếm Đơn Hàng" value={searchInput} onFocus={() => { if (searchSuggestions.length) setSearchSuggestionsOpen(true) }} onChange={(event) => { setSearchInput(event.target.value); setSearchSuggestionsOpen(true); setActiveSearchSuggestion(-1) }} onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && searchSuggestions.length) { event.preventDefault(); setSearchSuggestionsOpen(true); setActiveSearchSuggestion((index) => Math.min(index + 1, searchSuggestions.length - 1)) }
          else if (event.key === 'ArrowUp' && searchSuggestions.length) { event.preventDefault(); setSearchSuggestionsOpen(true); setActiveSearchSuggestion((index) => Math.max(index - 1, 0)) }
          else if (event.key === 'Enter' && searchSuggestionsOpen && activeSearchSuggestion >= 0) { event.preventDefault(); selectSearchSuggestion(searchSuggestions[activeSearchSuggestion]) }
          else if (event.key === 'Escape') { setSearchSuggestionsOpen(false); setActiveSearchSuggestion(-1) }
        }} />
        {searchSuggestionsOpen && searchSuggestions.length > 0 && <div className="order-search-suggestions" id="order-search-suggestions" role="listbox" aria-label="Gợi Ý Đơn Hàng">{searchSuggestions.map((order, index) => <button className="order-search-suggestion" id={`order-search-suggestion-${index}`} type="button" role="option" aria-selected={activeSearchSuggestion === index} aria-label={order.description} key={order.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectSearchSuggestion(order)}>{shortenOrderDescription(order.description)}</button>)}</div>}
        {searchInput && <button className="icon-button search-clear" type="button" aria-label="Xóa Tìm Kiếm" title="Xóa Tìm Kiếm" onClick={() => { setSearchInput(''); setAppliedSearch(''); setSearchSuggestionsOpen(false); setActiveSearchSuggestion(-1) }}><X size={18} /></button>}
        <button className="icon-button search-submit" type="submit" aria-label="Tìm Kiếm" title="Tìm Kiếm"><Search size={19} /></button>
      </form>
      <div className="order-filter-controls" ref={filterControlsRef} aria-label="Bộ Lọc Đơn Hàng">
          <details className="filter-select cycle-filter-select" name="orders-filter-select">
            <summary aria-label={`Kỳ: ${cycleFilterSummary(pendingCycles, cycles)}`}><span className="filter-summary-label">Kỳ · {cycleFilterSummary(pendingCycles, cycles)}</span><ChevronDown size={15} aria-hidden="true" /></summary>
            <div className="filter-select-menu"><fieldset className="cycle-filter-fieldset"><legend>Kỳ Sổ</legend><input className="cycle-filter-search" type="search" aria-label="Tìm Kỳ Sổ" placeholder="Tìm Kỳ Sổ (ví dụ: 11.2026)" value={cycleSearch} onChange={(event) => setCycleSearch(event.target.value)} /><label className="filter-option cycle-filter-option filter-select-all"><input type="checkbox" aria-label="Chọn Tất Cả Kỳ" checked={allSelected(pendingCycles, cycles.map((cycle) => cycle.id))} onChange={(event) => setPendingCycles(event.target.checked ? null : [])} /><strong>Chọn Tất Cả</strong></label><div className="cycle-filter-list">{matchingCycles.map((cycle) => <label className="filter-option cycle-filter-option" aria-label={cycleDisplay(cycle)} key={cycle.id}><input type="checkbox" checked={pendingCycles === null || pendingCycles.includes(cycle.id)} onChange={() => toggleFilterValue(pendingCycles, cycle.id, cycles.map((item) => item.id), setPendingCycles)} /><span className="cycle-filter-copy"><strong>{cycle.label}</strong><span>{formatDate(cycle.starts_on)} – {formatDate(cycle.ends_on)}</span></span></label>)}</div>{matchingCycles.length === 0 && <p className="cycle-filter-empty">Không Tìm Thấy Kỳ Sổ.</p>}</fieldset></div>
          </details>
          <details className="filter-select status-filter-select" name="orders-filter-select">
            <summary aria-label={`Trạng Thái: ${allSelected(pendingStatuses, availableStatuses) || pendingStatuses?.length === 0 ? 'Tất Cả' : `${pendingStatuses?.length} mục`}`}><span className="filter-summary-label">Trạng Thái · {allSelected(pendingStatuses, availableStatuses) || pendingStatuses?.length === 0 ? 'Tất Cả' : `${pendingStatuses?.length} mục`}</span><ChevronDown size={15} aria-hidden="true" /></summary>
            <div className="filter-select-menu"><fieldset className="status-filter-fieldset"><legend>Trạng Thái</legend><label className="filter-option filter-select-all"><input type="checkbox" aria-label="Chọn Tất Cả Trạng Thái" checked={allSelected(pendingStatuses, availableStatuses)} onChange={(event) => setPendingStatuses(event.target.checked ? null : [])} /><strong>Chọn Tất Cả</strong></label>{Object.entries(statusLabels).filter(([value]) => statuses.has(value as OrderFilterStatus)).map(([value, label]) => <label className="filter-option" key={value}><input type="checkbox" checked={pendingStatuses === null || pendingStatuses.includes(value as OrderFilterStatus)} onChange={() => toggleFilterValue(pendingStatuses, value as OrderFilterStatus, availableStatuses, setPendingStatuses)} />{label}</label>)}</fieldset></div>
          </details>
          <button type="button" className="primary-button compact apply-order-filters" onClick={applyFilters}>Áp Dụng Bộ Lọc</button>
      </div>
      <div className="orders-mobile-sort" role="group" aria-label="Sắp Xếp Đơn Hàng">
        <label htmlFor="orders-mobile-sort-field">Sắp Xếp</label>
        <select id="orders-mobile-sort-field" value={sortKey ?? ''} onChange={(event) => chooseMobileSort(event.target.value)}>
          <option value="">Mặc Định</option>
          <option value="date">Ngày</option>
          <option value="amount">Số Tiền</option>
          <option value="cycle">Kỳ</option>
          <option value="status">Trạng Thái</option>
        </select>
        <button className="orders-mobile-sort-direction" type="button" aria-label={sortDirection === 'asc' ? 'Đổi Sang Giảm Dần' : 'Đổi Sang Tăng Dần'} title={sortDirection === 'asc' ? 'Đổi Sang Giảm Dần' : 'Đổi Sang Tăng Dần'} disabled={sortKey === null} onClick={() => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')}>
          {sortDirection === 'asc' ? <ArrowUp size={18} aria-hidden="true" /> : <ArrowDown size={18} aria-hidden="true" />}
        </button>
      </div>
      {isAdmin && <button className="primary-button compact orders-add-button" onClick={() => setShowNew(true)}><Plus size={18} />Thêm Đơn Hàng</button>}
    </section>
    {isAdmin && selectedOrders.length > 0 && <section className="selection-bar"><span>Chọn {selectedOrders.length} Đơn · tổng {formatVnd(selectedAmount)}</span><button className="primary-button compact" disabled={busy} onClick={() => setShowPaymentConfirm(true)}><CheckCircle2 size={17} />Ghi Nhận Đã Thanh Toán</button></section>}
    <section className="list-card orders-list">
      {orders.length === 0 ? <p className="empty-state">Chưa Có Đơn Hàng.</p> : filteredOrders.length === 0 ? <p className="empty-state">Không Tìm Thấy Đơn Hàng Phù Hợp.</p> : <div className="orders-table-scroll"><table className="orders-table">
        <thead><tr>
          <th className="selection-heading"><span className="sr-only">Chọn</span></th>
          <OrderSortHeader field="date" label="Ngày" active={sortKey === 'date'} direction={sortDirection} onSort={toggleSort} />
          <th>Đơn Hàng</th>
          <OrderSortHeader field="amount" label="Số Tiền" active={sortKey === 'amount'} direction={sortDirection} onSort={toggleSort} />
          <OrderSortHeader field="cycle" label="Kỳ" active={sortKey === 'cycle'} direction={sortDirection} onSort={toggleSort} />
          <OrderSortHeader className="orders-status-heading" field="status" label="Trạng Thái" active={sortKey === 'status'} direction={sortDirection} onSort={toggleSort} />
          {isAdmin && <th>Hành Động</th>}
        </tr></thead>
        <tbody>{sortedOrders.map((order) => {
          const state = statusFor(order)
          const allocated = allocatedFor(order)
          const itemLines = orderDescriptionLines(order.description)
          const canSoftDelete = state === 'unpaid' && allocated === 0
          const cycle = order.billing_cycle_id ? cycleLabels.get(order.billing_cycle_id) : null
          const closed = cycleIsClosed(order)
          const orderUrl = validShopeeOrderUrl(order.shopee_order_url)
          return <tr className={`order-row ${state === 'deleted' ? 'is-deleted' : ''} ${state === 'paid' ? 'is-paid' : ''}`} key={order.id}>
            <td className="selection-cell">{isAdmin && state === 'unpaid' && !closed && <input aria-label={`Chọn ${order.description}`} type="checkbox" checked={selected.includes(order.id)} onChange={() => toggleOrder(order.id)} />}</td>
            <td data-label="Ngày">{formatDate(order.placed_at)}</td>
            <td data-label="Đơn Hàng"><div className="order-item-lines">{itemLines.map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}</div></td>
            <td className="amount-cell" data-label="Số Tiền"><strong>{formatVnd(order.amount)}</strong>{allocated > 0 && state !== 'deleted' && <small>Còn {formatVnd(remainingFor(order))}</small>}</td>
            <td data-label="Kỳ">{cycle ? `${cycle}${closed ? ' · Đã Khóa' : ''}` : 'Chưa Xác Định'}</td>
            <td className="status-cell" data-label="Trạng Thái"><span className={`order-status ${state}`}>{statusLabels[state]}</span></td>
            {isAdmin && <td data-label="Hành Động"><div className="order-actions">
              {isAdmin && <a className={`icon-button ${orderUrl ? '' : 'disabled-action'}`} href={orderUrl ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={orderUrl ? 'Xem Đơn Trên Shopee' : 'Chưa Có Mã Đơn Shopee'} title={orderUrl ? 'Xem Đơn Trên Shopee' : 'Chưa Có Mã Đơn Shopee'} aria-disabled={!orderUrl} onClick={(event) => { if (!orderUrl) event.preventDefault() }}><Eye size={18} /></a>}
              {isAdmin && state === 'deleted' && <button className={`icon-button ${closed ? 'disabled-action' : ''}`} type="button" aria-label="Khôi Phục Đơn" title={closed ? 'Mở khóa kỳ để khôi phục' : 'Khôi Phục Đơn'} disabled={closed} onClick={() => void restoreOrder(order)}><RotateCcw size={18} /></button>}
              {isAdmin && state !== 'deleted' && state !== 'cancelled' && !closed && <>
                <button className={`icon-button ${state === 'paid' ? 'disabled-action' : ''}`} type="button" aria-label="Sửa Đơn" title={state === 'paid' ? 'Đơn đã thanh toán không thể chỉnh sửa' : 'Sửa Đơn'} disabled={state === 'paid'} onClick={() => setEditing(order)}><Pencil size={18} /></button>
                {state !== 'paid' && (canSoftDelete ? <button className="icon-button" type="button" aria-label="Xóa Đơn" title="Xóa Đơn" onClick={() => void softDeleteOrder(order)}><Trash2 size={18} /></button> : <button className="icon-button" type="button" aria-label="Hủy Đơn" title="Chỉ hủy khi Shopee dừng đơn trước khi hoàn tất; nhập tiền đã hoàn nếu có." onClick={() => void cancelOrder(order)}><CircleX size={18} /></button>)}
              </>}
            </div></td>}
          </tr>
        })}</tbody>
      </table></div>}
    </section>
    {showNew && <OrderDialog onClose={() => setShowNew(false)} onSaved={onUpdated} />}{editing && <OrderDialog order={editing} lockFinancialFields={allocatedFor(editing) > 0 || editing.status === 'paid'} onClose={() => setEditing(null)} onSaved={onUpdated} />}
    {showPaymentConfirm && <Dialog title="Xác Nhận Thanh Toán" onClose={() => setShowPaymentConfirm(false)}><div className="form-stack"><p>Xác nhận đã nhận đủ tiền thanh toán cho các đơn đã chọn?</p><div className="payment-confirmation-summary"><span>Số Đơn</span><strong>{selectedOrders.length}</strong><span>Tổng Thanh Toán</span><strong>{formatVnd(selectedAmount)}</strong></div><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setShowPaymentConfirm(false)}>Hủy</button><button className="primary-button" type="button" disabled={busy} onClick={() => void markPaid()}>{busy ? 'Đang Ghi Nhận…' : 'Xác Nhận Thanh Toán'}</button></div></div></Dialog>}
    {pendingOrderAction?.type === 'delete' && <Dialog title="Xóa Đơn Hàng" onClose={() => setPendingOrderAction(null)}><div className="form-stack"><p>Đánh dấu đơn “{pendingOrderAction.order.description}” là Đã Xóa? Đơn vẫn được lưu và có thể khôi phục.</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setPendingOrderAction(null)}>Hủy</button><button className="primary-button" type="button" disabled={busy} onClick={() => void confirmSoftDelete()}>Xác Nhận Xóa</button></div></div></Dialog>}
    {pendingOrderAction?.type === 'restore' && <Dialog title="Khôi Phục Đơn Hàng" className="restore-order-dialog" closeIcon onClose={() => setPendingOrderAction(null)}><div className="restore-order-confirmation"><p className="restore-order-message">Khôi phục đơn hàng này về danh sách?</p><div className="restore-order-preview"><span className="restore-order-preview-label">Đơn Hàng</span><p title={pendingOrderAction.order.description}>{pendingOrderAction.order.description}</p></div><p className="restore-order-impact">Đơn sẽ xuất hiện lại với trạng thái Chưa Thanh Toán.</p><div className="restore-order-actions"><button className="secondary-button" type="button" onClick={() => setPendingOrderAction(null)}>Hủy</button><button className="primary-button" type="button" disabled={busy} onClick={() => void confirmRestore()}>{busy ? 'Đang Khôi Phục…' : 'Khôi Phục Đơn'}</button></div></div></Dialog>}
    {pendingOrderAction?.type === 'cancel' && <Dialog title="Hủy Đơn Trên Shopee" onClose={() => { setPendingOrderAction(null); setCancelError('') }}><form className="form-stack" onSubmit={confirmCancel}><p>Chỉ dùng khi Shopee đã dừng đơn trước khi hoàn tất.</p>{allocatedFor(pendingOrderAction.order) > 0 && <label>Số Tiền Đã Hoàn (VND)<input required name="refund" inputMode="numeric" defaultValue={String(allocatedFor(pendingOrderAction.order))} /><span className="hint">Tối đa {formatVnd(allocatedFor(pendingOrderAction.order))}; nhập 0 nếu chưa hoàn.</span></label>}{cancelError && <p className="form-message" role="alert">{cancelError}</p>}<div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => { setPendingOrderAction(null); setCancelError('') }}>Đóng</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Đang Ghi Nhận…' : 'Xác Nhận Hủy Đơn'}</button></div></form></Dialog>}
    {notice && <NoticeDialog message={notice} onClose={() => setNotice('')} />}
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
    if (result.error) return setError('Không lưu được đơn hàng. Hãy kiểm tra dữ liệu và thử lại.')
    await onSaved(); onClose()
  }
  return <Dialog title={order ? 'Sửa Đơn Hàng' : 'Thêm Đơn Hàng'} onClose={onClose}><form className="form-stack" onSubmit={save}>
    <label><span className="label-title"><span className="label-copy">Mô Tả Đơn Hàng</span><span className="required-marker" aria-hidden="true">*</span></span><input required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <label>Đơn Hàng Shopee (Không Bắt Buộc)<input type="url" value={shopeeOrderUrl} onChange={(event) => setShopeeOrderUrl(event.target.value)} placeholder="https://shopee.vn/user/purchase/order/248511385254562?type=3" /></label>
    <label><span className="label-title"><span className="label-copy">Ngày Đặt</span><span className="required-marker" aria-hidden="true">*</span></span><input required type="date" value={placedAt} disabled={lockFinancialFields} onChange={(event) => setPlacedAt(event.target.value)} /></label>
    <label><span className="label-title"><span className="label-copy">Số Tiền (VND)</span><span className="required-marker" aria-hidden="true">*</span></span><input required inputMode="numeric" value={amount} disabled={lockFinancialFields} onChange={(event) => setAmount(event.target.value)} /></label>
    <p className="required-note"><span aria-hidden="true">*</span> Trường bắt buộc</p>{lockFinancialFields && <p className="hint">Đơn đã có phân bổ thanh toán nên ngày đặt và số tiền được khóa để giữ đúng lịch sử.</p>}{error && <p className="form-message">{error}</p>}<button className="primary-button" type="submit">Lưu Đơn Hàng</button></form></Dialog>
}

function InstallmentsPanel({ plans, isAdmin, onUpdated }: { plans: InstallmentPlan[]; isAdmin: boolean; onUpdated: () => Promise<void> }) {
  const [showCreate, setShowCreate] = useState(false)
  const [showPayment, setShowPayment] = useState<string | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [formError, setFormError] = useState('')
  useEffect(() => { void supabase?.from('installment_payments').select('*').order('paid_at',{ascending:false}).then(({data})=>setPayments(data??[])) }, [plans])
  const addPlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name=String(form.get('name')??'').trim(); const amount=parseVndInput(String(form.get('amount')??''))
    if(!supabase || !name || amount===null || amount<=0) return setFormError('Tên khoản và tổng tiền VND chưa hợp lệ.')
    const {error}=await supabase.from('installment_plans').insert({name,total_amount:amount}); if(error)setFormError('Không thể tạo khoản trả góp. Hãy kiểm tra dữ liệu và thử lại.');else{setShowCreate(false);setFormError('');await onUpdated()}
  }
  const addPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if(!supabase||!showPayment)return; const form=new FormData(event.currentTarget); const amount=parseVndInput(String(form.get('amount')??'')); const paid_at=String(form.get('paid_at')??today); const note=String(form.get('note')??'')
    if(amount===null||amount<=0)return setFormError('Số tiền VND phải là số nguyên dương.')
    const plan=plans.find(item=>item.id===showPayment); const remaining=plan ? plan.total_amount-plan.total_paid : 0
    if(amount>remaining)return setFormError(`Số tiền góp vượt quá số còn lại ${formatVnd(remaining)}.`)
    const {error}=await supabase.rpc('record_installment_payment',{p_plan_id:showPayment,p_amount:amount,p_paid_at:paid_at,p_note:note||null}); if(error)setFormError('Không thể ghi nhận lần góp. Hãy kiểm tra số tiền và số dư còn lại.'); else{setShowPayment(null);setFormError('');await onUpdated()}
  }
  return <section className="content-stack"><div className="page-heading"><div><p className="eyebrow">Khoản riêng</p><h2>Trả Góp</h2></div>{isAdmin&&<button className="primary-button compact" onClick={()=>setShowCreate(true)}><Plus size={18}/>Tạo Khoản Trả Góp</button>}</div><section className="list-card">{plans.length === 0 ? <p className="empty-state">Chưa có khoản trả góp.</p> : plans.map((plan) => { const remaining = plan.total_amount - plan.total_paid; const progress = Math.min(100, Math.round((plan.total_paid / plan.total_amount) * 100)); return <article className="installment-block" key={plan.id}><div className="installment-row"><div><strong>{plan.name}</strong><span>Đã góp {formatVnd(plan.total_paid)} / {formatVnd(plan.total_amount)}</span><div className="progress"><i style={{ width: `${progress}%` }} /></div></div><strong>{formatVnd(remaining)}<small>còn lại</small></strong></div>{isAdmin&&<button className="secondary-button" onClick={()=>setShowPayment(plan.id)}>Ghi Nhận Lần Góp</button>}<div className="payment-history">{payments.filter(p=>p.plan_id===plan.id).map(p=><div key={p.id}><span>{formatDate(p.paid_at)} · {p.note||'Đã góp'}</span><strong>{formatVnd(p.amount)}</strong></div>)}</div></article>})}</section>
    {showCreate&&<Dialog title="Tạo Khoản Trả Góp" onClose={()=>{setShowCreate(false);setFormError('')}}><form className="form-stack" onSubmit={addPlan}><label>Tên Khoản<input required name="name"/></label><label>Tổng Tiền (VND)<input required name="amount" inputMode="numeric"/></label>{formError&&<p className="form-message" role="alert">{formError}</p>}<button className="primary-button">Tạo Khoản Trả Góp</button></form></Dialog>}
    {showPayment&&<Dialog title="Ghi Nhận Lần Góp" onClose={()=>{setShowPayment(null);setFormError('')}}><form className="form-stack" onSubmit={addPayment}><label>Ngày Góp<input required type="date" name="paid_at" defaultValue={today}/></label><label>Số Tiền (VND)<input required name="amount" inputMode="numeric"/></label><label>Ghi Chú<input name="note"/></label>{formError&&<p className="form-message" role="alert">{formError}</p>}<button className="primary-button">Lưu Lần Góp</button></form></Dialog>}
  </section>
}

function ReportsPanel({orders,payments,plans,cycles,ledgerEntries,closings,selected,onSelect,onUpdated,isAdmin}:{orders:Order[];payments:Payment[];plans:InstallmentPlan[];cycles:any[];ledgerEntries:any[];closings:any[];selected:string;onSelect:(v:string)=>void;onUpdated:()=>Promise<void>;isAdmin:boolean}){
  const [notice, setNotice] = useState('')
  const cycle=cycles.find(c=>c.id===selected)??cycles[0]
  const cycleOrders=cycle?orders.filter(o=>o.billing_cycle_id===cycle.id):[]
  const purchases=cycleOrders.filter(o=>o.status!=='cancelled'&&!o.deleted_at).reduce((s,o)=>s+o.amount,0)
  const paid=payments.filter(p=>cycle&&p.paid_at>=cycle.starts_on&&p.paid_at<=cycle.ends_on).reduce((s,p)=>s+p.amount,0)
  const adjustments=ledgerEntries.filter(e=>e.billing_cycle_id===cycle?.id).reduce((s,e)=>s+e.amount,0)
  const opening=cycle?.opening_balance??0
  const snapshot=closings.find(c=>c.billing_cycle_id===cycle?.id&&c.is_current!==false)
  const ending=snapshot?.closing_balance??(opening+purchases-paid+adjustments)
  const exportCsv=()=>{
    const rows=[['Loại','Ngày','Nội dung','Số tiền (VND)','Trạng thái'],...cycleOrders.map(o=>['Đơn hàng',o.placed_at,o.description,String(o.amount),o.deleted_at?'Đã Xóa':o.status==='paid'?'Đã Thanh Toán':o.status==='cancelled'?'Đã Hủy':'Chưa Thanh Toán']),...payments.filter(p=>cycle&&p.paid_at>=cycle.starts_on&&p.paid_at<=cycle.ends_on).map(p=>['Thanh toán',p.paid_at,p.note??'',String(p.amount),'Đã nhận']),...ledgerEntries.filter(e=>e.billing_cycle_id===cycle?.id).map(e=>['Điều chỉnh',e.entry_date,e.description,String(e.amount),e.kind])]
    const excelEscape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
    const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Bao cao ${cycle?.label??''}"><Table>${rows.map(row=>`<Row>${row.map((cell,index)=>`<Cell><Data ss:Type="${index===3&&/^[-0-9]+$/.test(cell)?'Number':'String'}">${excelEscape(cell)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`
    const blob=new Blob([xml],{type:'application/vnd.ms-excel;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`bao-cao-${cycle?.label??'ky'}.xls`;link.click();URL.revokeObjectURL(link.href)
  }
  const pdf=()=>window.print()
  const toggleClose=async()=>{if(!supabase||!cycle)return;const {error}=await supabase.rpc(cycle.status==='closed'?'reopen_billing_cycle':'close_billing_cycle',{p_cycle_id:cycle.id});if(error)setNotice('Không thể khóa hoặc mở khóa kỳ sổ. Hãy kiểm tra trạng thái kỳ rồi thử lại.');else await onUpdated()}
  return <><section className="content-stack report-panel"><div className="page-heading"><div><p className="eyebrow">Đối soát</p><h2>Báo cáo kỳ</h2></div><div className="report-actions"><button className="secondary-button" onClick={exportCsv}>Xuất Excel</button><button className="secondary-button" onClick={pdf}>Lưu PDF</button></div></div>{cycles.length===0?<section className="list-card empty-state">Chưa có kỳ sổ nào.</section>:<><label>Kỳ sổ<select value={cycle?.id??''} onChange={e=>onSelect(e.target.value)}>{cycles.map(c=><option key={c.id} value={c.id}>{cycleDisplay(c)} · {c.status==='closed'?'Đã khóa':'Đang mở'}</option>)}</select></label><section className="metric-grid"><article className="metric"><span>Dư đầu kỳ</span><strong>{formatVnd(opening)}</strong></article><article className="metric"><span>Đơn phát sinh</span><strong>{formatVnd(purchases)}</strong></article><article className="metric"><span>Đã thanh toán trong kỳ</span><strong>{formatVnd(paid)}</strong></article><article className="metric"><span>Còn lại theo kỳ</span><strong>{formatVnd(ending)}</strong></article></section><section className="list-card report-orders">{cycleOrders.length?cycleOrders.map(o=><div className={`report-line ${o.deleted_at?'is-deleted':''}`} key={o.id}><span>{formatDate(o.placed_at)} · {o.description}{o.deleted_at?' · Đã Xóa':''}</span><strong>{formatVnd(o.amount)}</strong></div>):<p className="empty-state">Kỳ này chưa có đơn hàng.</p>}{isAdmin&&<button className="primary-button compact" onClick={()=>void toggleClose()}>{cycle.status==='closed'?'Mở khóa kỳ':'Khóa sổ kỳ này'}</button>}{cycle.status==='closed'&&<p className="hint">Kỳ đã khóa. Báo cáo đọc số dư đã lưu tại thời điểm khóa.</p>}</section></>}</section>{notice&&<NoticeDialog message={notice} onClose={()=>setNotice('')}/>}</>
}

function PaymentCard({ imageUrl, note, onClose }: { imageUrl: string; note: string; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const downloadQr = async () => {
    if (!imageUrl || downloading) return
    setDownloading(true)
    setDownloadError('')
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error('QR download failed')
      const image = await response.blob()
      const objectUrl = URL.createObjectURL(image)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = 'ShopeeLin-QR-Thanh-Toan.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      setDownloadError('Không thể tải ảnh QR. Bạn có thể mở ảnh riêng rồi chọn lưu, hoặc dùng thiết bị khác để quét.')
    } finally {
      setDownloading(false)
    }
  }

  return <Dialog title="Thanh toán" onClose={onClose}>
    <div className="payment-card">
      {imageUrl ? <img src={imageUrl} alt="Ảnh QR thanh toán" /> : <p className="form-message">Chưa có ảnh QR thanh toán.</p>}
      {imageUrl && <div className="payment-qr-actions"><button className="secondary-button" type="button" onClick={() => void downloadQr()} disabled={downloading}><Download size={17} aria-hidden="true" />{downloading ? 'Đang tải ảnh QR…' : 'Tải ảnh QR'}</button><p>Trên điện thoại, lưu ảnh rồi chọn ảnh đó trong mục quét QR của ứng dụng ngân hàng.</p></div>}
      {downloadError && <p className="form-message" role="alert">{downloadError} <a href={imageUrl} target="_blank" rel="noopener noreferrer">Mở ảnh QR trong tab mới</a></p>}
      <p className="payment-note">{note}</p>
    </div>
  </Dialog>
}

function NoticeDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return <Dialog title="Thông Báo" onClose={onClose}><div className="form-stack"><p role="alert">{message}</p><button className="primary-button" type="button" onClick={onClose}>Đóng</button></div></Dialog>
}

function Dialog({ title, children, onClose, className, closeIcon = false }: { title: string; children: React.ReactNode; onClose: () => void; className?: string; closeIcon?: boolean }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className={`dialog ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="dialog-heading"><h2>{title}</h2>{closeIcon ? <button className="dialog-close-icon" type="button" aria-label="Đóng" title="Đóng" onClick={onClose}><X size={18} aria-hidden="true" /></button> : <button className="text-button" onClick={onClose}>Đóng</button>}</div>{children}</section></div>
}
