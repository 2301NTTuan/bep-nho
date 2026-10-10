'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiRequestError, apiRequest, getErrorMessage } from '../../../lib/api';

function JoinHousehold() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const token = params.get('token') ?? '';

  useEffect(() => {
    void apiRequest('/me').catch((cause) => {
      if (cause instanceof ApiRequestError && cause.status === 401) router.replace(`/login?next=${encodeURIComponent(`/household/join?token=${token}`)}`);
    });
  }, [router, token]);

  async function accept() {
    if (!token) { setError('Liên kết mời không hợp lệ.'); return; }
    setBusy(true); setError('');
    try {
      await apiRequest('/household-invites/accept', { method: 'POST', body: JSON.stringify({ token }) });
      router.replace('/household');
    } catch (cause) { setError(getErrorMessage(cause, 'Lời mời đã hết hạn hoặc đã được sử dụng.')); }
    finally { setBusy(false); }
  }

  return <main className="authShell"><Link className="authBrand brand" href="/">Bếp Nhớ</Link><section className="authCard"><div className="eyebrow"><span /> Lời mời gia đình</div><h1>Vào chung một gian bếp</h1><p>Tham gia để xem Family Taste và tạo công thức phù hợp với cả nhà. Ghi chú và phản hồi cá nhân của bạn vẫn không hiển thị cho thành viên khác.</p>{error && <div className="inlineError" role="alert">{error}</div>}<button className="button authSubmit" disabled={busy || !token} onClick={() => void accept()}>{busy ? 'Đang tham gia…' : 'Chấp nhận lời mời'}</button><p className="authSwitch"><Link href="/household">Quay lại trang gia đình</Link></p></section></main>;
}

export default function JoinHouseholdPage() {
  return <Suspense fallback={<main className="authShell"><div className="stateCard">Đang mở lời mời…</div></main>}><JoinHousehold /></Suspense>;
}
