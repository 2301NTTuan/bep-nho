'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import type { PasswordResetResponse } from '@bep-nho/contracts';
import { apiRequest, getErrorMessage } from '../../lib/api';

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await apiRequest<PasswordResetResponse>('/auth/password-reset/confirm', {
        method: 'POST', body: JSON.stringify({ token, newPassword }),
      });
      router.replace('/login?passwordReset=1');
    } catch (cause) { setError(getErrorMessage(cause, 'Liên kết không hợp lệ hoặc đã hết hạn.')); }
    finally { setBusy(false); }
  }

  return (
    <main className="authShell">
      <Link href="/" className="brand authBrand" aria-label="Bếp Nhớ — trang chủ"><span className="brandMark" aria-hidden="true">BN</span><span><strong>Bếp Nhớ</strong><small>Gian bếp hiểu bạn</small></span></Link>
      <section className="authCard">
        <div className="smallLabel">Mật khẩu mới</div><h1>Đặt lại mật khẩu</h1><p>Thao tác này sẽ thu hồi mọi phiên đăng nhập cũ.</p>
        {!token ? <div className="inlineError" role="alert">Liên kết thiếu token đặt lại.</div> : (
          <form className="authForm" onSubmit={(event) => void submit(event)}>
            <label><span>Mật khẩu mới</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            {error && <div className="inlineError" role="alert">{error}</div>}
            <button className="button authSubmit" type="submit" disabled={busy}>{busy ? 'Đang đặt lại…' : 'Đặt mật khẩu mới'}</button>
          </form>
        )}
      </section>
    </main>
  );
}
