'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import type { CurrentUserResponse } from '@bep-nho/contracts';
import { ApiRequestError, apiRequest, getErrorMessage } from '../lib/api';
import { establishDevelopmentSession } from '../lib/current-user';

type AuthMode = 'login' | 'register';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registering = mode === 'register';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (registering && password.length < 12) {
      setError('Mật khẩu cần ít nhất 12 ký tự.');
      return;
    }

    setBusy(true);
    try {
      await apiRequest<CurrentUserResponse>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.replace('/');
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError && !registering && cause.status === 401) {
        setError('Email hoặc mật khẩu chưa đúng.');
      } else if (cause instanceof ApiRequestError && registering && cause.status === 409) {
        setError('Email này đã có tài khoản. Hãy đăng nhập hoặc dùng email khác.');
      } else if (cause instanceof ApiRequestError && cause.status === 400) {
        setError('Hãy kiểm tra email và mật khẩu rồi thử lại.');
      } else {
        setError(getErrorMessage(
          cause,
          registering ? 'Chưa thể tạo tài khoản.' : 'Email hoặc mật khẩu chưa đúng.',
        ));
      }
    } finally {
      setBusy(false);
    }
  }

  async function useDevAccount() {
    setBusy(true); setError(null);
    try {
      await establishDevelopmentSession();
      router.replace('/');
      router.refresh();
    } catch (cause) {
      setError(getErrorMessage(cause, 'Không thể mở phiên phát triển.'));
    } finally { setBusy(false); }
  }

  return (
    <main className="authShell">
      <Link href="/" className="brand authBrand" aria-label="Bếp Nhớ — trang chủ">
        <span className="brandMark" aria-hidden="true">BN</span>
        <span><strong>Bếp Nhớ</strong><small>Gian bếp hiểu bạn</small></span>
      </Link>
      <section className="authCard">
        <div className="smallLabel">{registering ? 'Bắt đầu ghi nhớ khẩu vị' : 'Chào bạn trở lại'}</div>
        <h1>{registering ? 'Tạo tài khoản Bếp Nhớ' : 'Mở lại gian bếp của bạn'}</h1>
        <p>{registering ? 'Mỗi lần nấu sẽ giúp công thức sau vừa vị hơn.' : 'Đăng nhập để tiếp tục công thức và Taste DNA của riêng bạn.'}</p>

        <form className="authForm" onSubmit={(event) => void submit(event)}>
          <label>
            <span>Email</span>
            <input type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@example.com" />
          </label>
          <label>
            <span>Mật khẩu</span>
            <input type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={registering ? 'Ít nhất 12 ký tự' : 'Mật khẩu của bạn'} />
          </label>
          {error && <div className="inlineError" role="alert">{error}</div>}
          <button className="button authSubmit" type="submit" disabled={busy}>
            {busy ? 'Đang mở bếp…' : registering ? 'Tạo tài khoản →' : 'Đăng nhập →'}
          </button>
        </form>

        <p className="authSwitch">
          {registering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
          <Link href={registering ? '/login' : '/register'}>{registering ? 'Đăng nhập' : 'Tạo tài khoản'}</Link>
        </p>

        {!registering && process.env.NODE_ENV !== 'production' && (
          <button className="devAuthButton" type="button" disabled={busy} onClick={() => void useDevAccount()}>
            Dùng tài khoản dev
          </button>
        )}
      </section>
    </main>
  );
}
