'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type {
  AccountSession,
  AccountSessionsResponse,
  ChangePasswordResponse,
  CurrentUserContext,
  DeleteAccountResponse,
  LifecycleRequestResponse,
  RevokeOtherSessionsResponse,
  RevokeSessionResponse,
} from '@bep-nho/contracts';
import { apiRequest, getErrorMessage } from '../../lib/api';
import { clearCookQueue } from '../../lib/cook-event-queue';
import { loadCurrentUser } from '../../lib/current-user';

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUserContext | null>(null);
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [context, sessionResponse] = await Promise.all([
        loadCurrentUser(),
        apiRequest<AccountSessionsResponse>('/me/sessions'),
      ]);
      setUser(context);
      setSessions(sessionResponse.data);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Không tải được cài đặt tài khoản.'));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key); setError(null); setNotice(null);
    try { setNotice(await action()); }
    catch (cause) { setError(getErrorMessage(cause, 'Thao tác chưa hoàn tất.')); }
    finally { setBusy(null); }
  }

  async function resendVerification() {
    if (!user?.user.email) return;
    await run('verification', async () => {
      await apiRequest<LifecycleRequestResponse>('/auth/email-verification/request', {
        method: 'POST', body: JSON.stringify({ email: user.user.email }),
      });
      return 'Nếu địa chỉ hợp lệ, email xác minh mới đã được gửi.';
    });
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run('password', async () => {
      const response = await apiRequest<ChangePasswordResponse>('/me/password', {
        method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword(''); setNewPassword('');
      await refresh();
      return `Đã đổi mật khẩu và thu hồi ${response.data.revokedOtherSessions} phiên khác.`;
    });
  }

  async function revokeSession(session: AccountSession) {
    await run(`session-${session.id}`, async () => {
      const response = await apiRequest<RevokeSessionResponse>(`/me/sessions/${session.id}`, {
        method: 'DELETE',
      });
      if (response.data.currentSessionRevoked) {
        if (user) await clearCookQueue(user.user.id);
        router.replace('/login');
        return 'Phiên hiện tại đã được thu hồi.';
      }
      await refresh();
      return 'Phiên đã được thu hồi.';
    });
  }

  async function revokeOthers() {
    await run('revoke-others', async () => {
      const response = await apiRequest<RevokeOtherSessionsResponse>('/me/sessions/revoke-others', {
        method: 'POST',
      });
      await refresh();
      return `Đã thu hồi ${response.data.revoked} phiên khác.`;
    });
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run('delete', async () => {
      await apiRequest<DeleteAccountResponse>('/me/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword, confirm: deleteConfirmation }),
      });
      if (user) await clearCookQueue(user.user.id);
      router.replace('/');
      router.refresh();
      return 'Tài khoản đã được xóa.';
    });
  }

  return (
    <main className="shell accountShell">
      <header className="detailNav">
        <Link href="/" className="brand" aria-label="Bếp Nhớ — trang chủ">
          <span className="brandMark" aria-hidden="true">BN</span>
          <span><strong>Bếp Nhớ</strong><small>Gian bếp hiểu bạn</small></span>
        </Link>
        <Link href="/">← Về trang chủ</Link>
      </header>

      <section className="accountHero">
        <div className="smallLabel">Tài khoản & bảo mật</div>
        <h1>Quyền kiểm soát luôn thuộc về bạn.</h1>
        <p>Quản lý email, mật khẩu, các phiên đăng nhập và dữ liệu riêng của bạn.</p>
      </section>

      {error && <div className="inlineError accountNotice" role="alert">{error}</div>}
      {notice && <div className="successNotice accountNotice" role="status">{notice}</div>}

      <div className="accountGrid">
        <section className="accountPanel" aria-labelledby="account-email-title">
          <h2 id="account-email-title">Email</h2>
          <p>{user?.user.email ?? 'Tài khoản phát triển không có email.'}</p>
          {user?.user.email && (
            user.user.emailVerified ? (
              <span className="statusBadge verified">Đã xác minh</span>
            ) : (
              <>
                <span className="statusBadge pending">Chưa xác minh</span>
                <button type="button" className="button secondary" disabled={busy !== null} onClick={() => void resendVerification()}>
                  {busy === 'verification' ? 'Đang gửi…' : 'Gửi lại email xác minh'}
                </button>
              </>
            )
          )}
        </section>

        <section className="accountPanel" aria-labelledby="password-title">
          <h2 id="password-title">Đổi mật khẩu</h2>
          <form className="authForm" onSubmit={(event) => void changePassword(event)}>
            <label><span>Mật khẩu hiện tại</span><input type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
            <label><span>Mật khẩu mới</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            <button className="button" type="submit" disabled={busy !== null}>{busy === 'password' ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
          </form>
        </section>

        <section className="accountPanel sessionsPanel" aria-labelledby="sessions-title">
          <div className="panelHeading"><div><h2 id="sessions-title">Phiên đăng nhập</h2><p>Chỉ hiển thị thời gian hoạt động, không lưu IP hay dấu vân tay thiết bị.</p></div><button type="button" className="button secondary" disabled={busy !== null} onClick={() => void revokeOthers()}>Thu hồi các phiên khác</button></div>
          <ul className="sessionList">
            {sessions.map((session) => (
              <li key={session.id}>
                <div><strong>{session.current ? 'Thiết bị này' : 'Phiên khác'}</strong><span>Tạo {new Date(session.createdAt).toLocaleString('vi-VN')}</span><span>Hoạt động {session.lastUsedAt ? new Date(session.lastUsedAt).toLocaleString('vi-VN') : 'chưa ghi nhận'}</span></div>
                <button type="button" className="textDanger" disabled={busy !== null} onClick={() => void revokeSession(session)}>{session.current ? 'Đăng xuất phiên này' : 'Thu hồi phiên'}</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="accountPanel dangerPanel" aria-labelledby="delete-title">
          <h2 id="delete-title">Xóa tài khoản</h2>
          <p>Xóa vĩnh viễn tài khoản cùng CookSession, Taste DNA và các phiên bản cá nhân. Công thức chuẩn dùng chung không bị xóa.</p>
          <form className="authForm" onSubmit={(event) => void deleteAccount(event)}>
            <label><span>Mật khẩu</span><input type="password" autoComplete="current-password" required maxLength={128} value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label>
            <label><span>Nhập DELETE để xác nhận</span><input type="text" autoComplete="off" required value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label>
            <button className="button dangerButton" type="submit" disabled={busy !== null || deleteConfirmation !== 'DELETE'}>{busy === 'delete' ? 'Đang xóa…' : 'Xóa vĩnh viễn tài khoản'}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
