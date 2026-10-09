'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import type { LifecycleRequestResponse } from '@bep-nho/contracts';
import { apiRequest, getErrorMessage } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await apiRequest<LifecycleRequestResponse>('/auth/password-reset/request', {
        method: 'POST', body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (cause) { setError(getErrorMessage(cause, 'Chưa thể gửi yêu cầu đặt lại mật khẩu.')); }
    finally { setBusy(false); }
  }

  return (
    <main className="authShell">
      <Link href="/" className="brand authBrand" aria-label="Bếp Nhớ — trang chủ"><span className="brandMark" aria-hidden="true">BN</span><span><strong>Bếp Nhớ</strong><small>Gian bếp hiểu bạn</small></span></Link>
      <section className="authCard">
        <div className="smallLabel">Khôi phục tài khoản</div>
        <h1>Quên mật khẩu?</h1>
        <p>Nhập email của bạn. Phản hồi luôn giống nhau để bảo vệ sự riêng tư của tài khoản.</p>
        {sent ? <div className="successNotice" role="status">Nếu email có tài khoản, liên kết đặt lại mật khẩu đã được gửi.</div> : (
          <form className="authForm" onSubmit={(event) => void submit(event)}>
            <label><span>Email</span><input type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            {error && <div className="inlineError" role="alert">{error}</div>}
            <button className="button authSubmit" type="submit" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}</button>
          </form>
        )}
        <p className="authSwitch"><Link href="/login">← Trở lại đăng nhập</Link></p>
      </section>
    </main>
  );
}
