export type Role = 'admin' | 'viewer'
export type OrderStatus = 'unpaid' | 'paid' | 'cancelled'

export type Profile = {
  id: string
  email: string
  full_name: string
  role: Role
  avatar_path?: string | null
}

export type Order = {
  id: string
  placed_at: string
  description: string
  notes?: string | null
  shopee_order_url: string | null
  amount: number
  status: OrderStatus
  billing_cycle_id: string | null
  deleted_at: string | null
}

export type Payment = {
  id: string
  paid_at: string
  amount: number
  note: string | null
}

export type PaymentSettings = {
  singleton: boolean
  note: string
  qr_image_path: string | null
  installment_qr_image_path: string | null
  updated_at: string
  updated_by: string | null
}

export type InstallmentPlan = {
  id: string
  name: string
  total_amount: number
  total_paid: number
}

