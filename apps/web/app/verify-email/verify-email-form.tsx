'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { EmailVerificationResponse } from '@bep-nho/contracts';
import { apiRequest, getErrorMessage } from '../../lib/api';

export function VerifyEmailForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiRequest<EmailVerificationResponse>('/auth/email-verification/confirm', {
      method: 'POST', body: JSON.stringify({ token }),
    }).then(() => router.replace('/account?verified=1'))
      .catch((cause) => setError(getErrorMessage(cause, 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.')));
  }, [router, token]);

  return (
    <main className="authShell">
      <Link href="/" className="brand authBrand" aria-label="Bếp Nhớ — trang chủ"><span className="brandMark" aria-hidden="true">BN</span><span><strong>Bếp Nhớ</strong><small>Gian bếp hiểu bạn</small></span></Link>
      <section className="authCard"><div className="smallLabel">Xác minh email</div><h1>{error || !token ? 'Chưa thể xác minh' : 'Đang xác minh…'}</h1>{error ? <div className="inlineError" role="alert">{error}</div> : !token ? <div className="inlineError" role="alert">Liên kết thiếu token xác minh.</div> : <p role="status">Bếp Nhớ đang kiểm tra liên kết một lần của bạn.</p>}</section>
    </main>
  );
}
