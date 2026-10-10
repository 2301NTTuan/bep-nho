'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ApiRequestError, apiRequest, getErrorMessage } from '../../lib/api';

type Member = { id: string; role: 'owner' | 'member'; joinedAt: string; displayIdentifier: string; current: boolean };
type Household = { id: string; name: string; status: string; role: 'owner' | 'member'; members: Member[] };
type HouseholdResponse = { data: Household };
type FamilyTaste = { data: { algorithmVersion: string; dimensions: Array<{ key: string; score: number; confidence: number; activeMemberCount: number; contributingMemberCount: number }> } };

export default function HouseholdPage() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [taste, setTaste] = useState<FamilyTaste['data'] | null>(null);
  const [name, setName] = useState('Nhà mình');
  const [inviteUrl, setInviteUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const response = await apiRequest<HouseholdResponse>('/me/household');
      setHousehold(response.data);
      setName(response.data.name);
      const family = await apiRequest<FamilyTaste>('/me/household/taste-profile');
      setTaste(family.data);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 404) {
        setHousehold(null); setTaste(null);
      } else if (cause instanceof ApiRequestError && cause.status === 401) {
        window.location.href = '/login';
      } else setError(getErrorMessage(cause, 'Không tải được gia đình.'));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await apiRequest('/me/household', { method: 'POST', body: JSON.stringify({ name }) });
      await load();
    } catch (cause) { setError(getErrorMessage(cause, 'Chưa thể tạo gia đình.')); }
    finally { setBusy(false); }
  }

  async function rename(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await apiRequest('/me/household', { method: 'PATCH', body: JSON.stringify({ name }) });
      await load();
    } catch (cause) { setError(getErrorMessage(cause, 'Chưa thể đổi tên gia đình.')); }
    finally { setBusy(false); }
  }

  async function invite() {
    setBusy(true); setError('');
    try {
      const response = await apiRequest<{ data: { joinUrl: string } }>('/me/household/invites', { method: 'POST' });
      setInviteUrl(`${window.location.origin}${response.data.joinUrl}`);
    } catch (cause) { setError(getErrorMessage(cause, 'Chưa thể tạo lời mời.')); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
  }

  async function remove(memberId: string) {
    setBusy(true); setError('');
    try { await apiRequest(`/me/household/members/${memberId}`, { method: 'DELETE' }); await load(); }
    catch (cause) { setError(getErrorMessage(cause, 'Chưa thể xoá thành viên.')); }
    finally { setBusy(false); }
  }

  async function leave() {
    setBusy(true); setError('');
    try { await apiRequest('/me/household/leave', { method: 'POST' }); setHousehold(null); setTaste(null); }
    catch (cause) { setError(getErrorMessage(cause, 'Chưa thể rời gia đình.')); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="shell householdShell"><div className="stateCard">Đang tải gia đình…</div></main>;

  return <main className="shell householdShell">
    <header className="detailNav"><Link href="/" className="backLink">← Về Bếp Nhớ</Link><div className="householdNav"><Link href="/household/pantry" className="backLink">Kho bếp</Link><Link href="/household/meal-plan" className="backLink">Kế hoạch bữa ăn</Link><Link href="/taste" className="backLink">Taste DNA cá nhân</Link></div></header>
    <section className="householdHero"><div className="eyebrow"><span /> Family Taste</div><h1>{household ? household.name : 'Khẩu vị chung của nhà mình'}</h1><p>Family Taste kết hợp Taste DNA hiện tại của các thành viên. Phản hồi và ghi chú nấu ăn vẫn là dữ liệu cá nhân; mỗi lần nấu chỉ cải thiện Taste DNA của người nấu.</p></section>
    {error && <div className="inlineError" role="alert">{error}</div>}
    {!household ? <section className="accountPanel householdCreate"><h2>Tạo gia đình</h2><p>Mỗi tài khoản chỉ tham gia một gia đình trong bản alpha này. Gia đình có tối đa 8 thành viên.</p><form className="authForm" onSubmit={create}><label><span>Tên gia đình</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label><button className="button authSubmit" disabled={busy}>Tạo gia đình</button></form><p className="authSwitch">Đã có lời mời? Mở đúng liên kết mời để tham gia.</p></section> : <>
      <div className="householdGrid"><section className="accountPanel"><div className="panelHeading"><div><h2>Thành viên</h2><p>{household.members.length}/8 người · Bạn là {household.role === 'owner' ? 'chủ gia đình' : 'thành viên'}</p></div></div><ul className="sessionList">{household.members.map((member) => <li key={member.id}><div><strong>{member.displayIdentifier}{member.current ? ' · bạn' : ''}</strong><span>{member.role === 'owner' ? 'Chủ gia đình' : 'Thành viên'} · tham gia {new Date(member.joinedAt).toLocaleDateString('vi-VN')}</span></div>{household.role === 'owner' && !member.current && <button className="textDanger" disabled={busy} onClick={() => void remove(member.id)}>Xoá thành viên</button>}</li>)}</ul>{household.role === 'member' && <button className="button secondary" disabled={busy} onClick={() => void leave()}>Rời gia đình</button>}</section>
      {household.role === 'owner' && <section className="accountPanel"><h2>Quản lý</h2><form className="authForm compactForm" onSubmit={rename}><label><span>Tên gia đình</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label><button className="button secondary" disabled={busy}>Đổi tên</button></form><button className="button" disabled={busy} onClick={() => void invite()}>Tạo liên kết mời một lần</button>{inviteUrl && <div className="inviteBox"><label><span>Liên kết hết hạn sau 7 ngày</span><input aria-label="Liên kết mời" readOnly value={inviteUrl} /></label><button className="button secondary" onClick={() => void copyInvite()}>Sao chép</button></div>}</section>}
      </div>
      <section className="accountPanel familyTastePanel"><h2>Family Taste</h2><p>Điểm gia đình là trung bình có trọng số theo độ tin cậy hiện tại. Thành viên chưa có bằng chứng vẫn làm giảm độ tin cậy chung. Thành viên không xem được phản hồi, ghi chú hay lịch sử riêng của nhau.</p><div className="familyTasteGrid">{taste?.dimensions.map((dimension) => <article key={dimension.key}><strong>{dimension.key}</strong><b>{dimension.score.toFixed(2)}</b><span>Tin cậy {Math.round(dimension.confidence * 100)}% · {dimension.contributingMemberCount}/{dimension.activeMemberCount} đóng góp</span></article>)}</div></section>
    </>}
  </main>;
}
