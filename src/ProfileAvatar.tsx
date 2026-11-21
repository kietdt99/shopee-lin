import { useEffect, useRef, useState } from 'react'
import { Camera, UserRound } from 'lucide-react'
import { supabase } from './lib/supabase'
import './ProfileAvatar.css'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

type ProfileAvatarProps = {
  userId: string
  avatarPath: string | null
  displayName: string
  onPathChange: (path: string) => void
}

/** Uploads an immutable, user-owned avatar object and reports its path for the profile-save RPC. */
export function ProfileAvatar({ userId, avatarPath, displayName, onPathChange }: ProfileAvatarProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setPreviewUrl('')
    if (!supabase || !avatarPath) return () => { active = false }

    void supabase.storage.from('profile-avatars').createSignedUrl(avatarPath, 1800).then(({ data, error: signedUrlError }) => {
      if (!active) return
      if (signedUrlError) setError('Không tải được ảnh đại diện đã lưu.')
      else setPreviewUrl(data.signedUrl)
    })
    return () => { active = false }
  }, [avatarPath])

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    setError('')
    if (!file) return
    const extension = MIME_EXTENSIONS[file.type]
    if (!extension) return setError('Chỉ nhận ảnh JPEG, PNG hoặc WebP.')
    if (file.size > MAX_AVATAR_BYTES) return setError('Ảnh đại diện phải nhỏ hơn hoặc bằng 2 MB.')
    if (!supabase) return setError('Supabase chưa được cấu hình.')

    setUploading(true)
    const path = `${userId}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })
    setUploading(false)
    if (uploadError) return setError(uploadError.message || 'Không tải được ảnh lên.')
    onPathChange(path)

    const { data, error: signedUrlError } = await supabase.storage.from('profile-avatars').createSignedUrl(path, 1800)
    if (signedUrlError) return setError('Ảnh đã tải lên nhưng chưa xem trước được. Hãy lưu thay đổi rồi mở lại Hồ Sơ.')
    setPreviewUrl(data.signedUrl)
  }

  return <div className="profile-avatar-control">
    <button
      className="profile-avatar-button"
      type="button"
      aria-label="Cập nhật ảnh đại diện"
      title="Cập nhật ảnh đại diện"
      disabled={uploading}
      onClick={() => fileInput.current?.click()}
    >
      {previewUrl
        ? <img className="profile-avatar-image" src={previewUrl} alt={`Ảnh đại diện ${displayName}`} />
        : <span className="profile-avatar-fallback"><UserRound aria-hidden="true" size={38} /></span>}
      <span className="profile-avatar-camera" aria-hidden="true"><Camera size={16} /></span>
      {uploading && <span className="profile-avatar-loading">Đang tải…</span>}
    </button>
    <input
      ref={fileInput}
      className="profile-avatar-file"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      aria-label="Chọn ảnh đại diện"
      onChange={(event) => void upload(event)}
    />
    <span className="profile-avatar-help">Nhấn ảnh để đổi · JPEG, PNG hoặc WebP · Tối đa 2 MB</span>
    {error && <p className="profile-avatar-error" role="alert">{error}</p>}
  </div>
}
