import { Suspense } from 'react';
import { VerifyEmailForm } from './verify-email-form';

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className="authShell"><div className="authCard">Đang xác minh…</div></main>}><VerifyEmailForm /></Suspense>;
}
