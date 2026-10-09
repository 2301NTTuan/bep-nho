import { Suspense } from 'react';
import { ResetPasswordForm } from './reset-password-form';

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="authShell"><div className="authCard">Đang mở liên kết…</div></main>}><ResetPasswordForm /></Suspense>;
}
