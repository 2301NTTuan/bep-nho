'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { TasteHistoryResponse, TasteProfileResponse } from '../../lib/types';
import { ApiRequestError, apiRequest, getErrorMessage } from '../../lib/api';
import { loadCurrentUser } from '../../lib/current-user';

const LABELS: Record<string, string> = {
  saltiness: 'Độ mặn', sweetness: 'Độ ngọt', sourness: 'Độ chua', spiciness: 'Độ cay',
  umami: 'Vị umami', fat_richness: 'Độ béo', bitterness: 'Độ đắng', softness: 'Độ mềm',
  dryness_sauce: 'Khô ↔ nhiều sốt', garlic_onion: 'Tỏi & hành', herbal_aroma: 'Hương rau thơm',
};

function valueText(value: number) {
  if (Math.abs(value) < 0.05) return 'cân bằng';
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

export default function TastePage() {
  const [profile, setProfile] = useState<TasteProfileResponse | null>(null);
  const [history, setHistory] = useState<TasteHistoryResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [nextProfile, nextHistory] = await Promise.all([
      apiRequest<TasteProfileResponse>('/me/taste-profile'),
      apiRequest<TasteHistoryResponse>('/me/taste-profile/history?limit=30'),
    ]);
    setProfile(nextProfile);
    setHistory(nextHistory);
    setDrafts(Object.fromEntries(nextProfile.data.dimensions.map((dimension) => [
      dimension.key, dimension.manualOverride ?? dimension.effectiveScore,
    ])));
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadCurrentUser();
        if (active) await reload();
      } catch (cause) {
        if (active) setError(cause instanceof ApiRequestError && cause.status === 401
          ? 'Bạn cần đăng nhập để xem Taste DNA.'
          : getErrorMessage(cause, 'Không tải được Taste DNA.'));
      } finally {
        if (active) setChecked(true);
      }
    })();
    return () => { active = false; };
  }, []);

  async function setOverride(key: string, value: number | null) {
    setBusyKey(key); setError(null);
    try {
      await apiRequest(`/me/taste-profile/dimensions/${key}/override`, {
        method: 'PATCH', body: JSON.stringify({ value }),
      });
      await reload();
    } catch (cause) {
      setError(getErrorMessage(cause, 'Không lưu được ưu tiên thủ công.'));
    } finally { setBusyKey(null); }
  }

  async function reset(key: string) {
    if (!window.confirm(`Đặt lại phần học của “${LABELS[key] ?? key}”? Phản hồi gốc vẫn được giữ.`)) return;
    setBusyKey(key); setError(null);
    try {
      await apiRequest(`/me/taste-profile/dimensions/${key}/reset`, {
        method: 'POST', body: JSON.stringify({ confirm: true }),
      });
      await reload();
    } catch (cause) {
      setError(getErrorMessage(cause, 'Không đặt lại được chiều khẩu vị.'));
    } finally { setBusyKey(null); }
  }

  if (!checked || (!profile && !error)) {
    return <main className="shell tasteShell"><div className="detailSkeleton"><i /><i /><i /></div></main>;
  }
  if (!profile) {
    return <main className="shell narrowShell"><Link href="/" className="backLink">← Về Bếp Nhớ</Link><div className="stateCard errorState"><span className="stateIcon">!</span><div><strong>Không mở được Taste DNA</strong><p>{error}</p><Link href="/login">Đăng nhập →</Link></div></div></main>;
  }

  return (
    <main className="shell tasteShell">
      <header className="detailNav"><Link href="/" className="backLink">← Về Bếp Nhớ</Link><span className="statusDot"><i /> Chỉ mình bạn xem được</span></header>
      <section className="tasteHero">
        <div><div className="eyebrow"><span /> Taste DNA có thể kiểm soát</div><h1>Khẩu vị của bạn, do bạn quyết định.</h1><p>Bếp Nhớ học từ phản hồi hợp lệ. Bạn có thể ưu tiên thủ công hoặc đặt lại một chiều mà không xóa lịch sử.</p></div>
        <div className="tasteSummary"><strong>{Math.round(profile.data.maturityScore * 100)}%</strong><span>độ trưởng thành</span><b>{profile.data.sampleCount} lần nấu đã học</b></div>
      </section>
      {error && <div className="inlineError" role="alert">{error}</div>}
      <section className="tasteDimensionGrid">
        {profile.data.dimensions.map((dimension) => (
          <article className="tasteDimension" key={dimension.key}>
            <header><div><span>{LABELS[dimension.key] ?? dimension.key}</span><strong>{valueText(dimension.effectiveScore)}</strong></div><small>{dimension.manualOverride === null ? 'Đang học tự động' : 'Ưu tiên thủ công'}</small></header>
            <p>{dimension.explanation}</p>
            <dl><div><dt>Điểm học</dt><dd>{valueText(dimension.score)}</dd></div><div><dt>Tin cậy</dt><dd>{Math.round(dimension.confidence * 100)}%</dd></div><div><dt>Mẫu hiệu lực</dt><dd>{dimension.sampleCount}</dd></div><div><dt>Trọng số</dt><dd>{dimension.effectiveWeight.toFixed(1)}</dd></div></dl>
            <label className="overrideControl"><span>Ưu tiên: {valueText(drafts[dimension.key] ?? 0)}</span><input type="range" min="-1" max="1" step="0.1" value={drafts[dimension.key] ?? 0} onChange={(event) => setDrafts((current) => ({ ...current, [dimension.key]: Number(event.target.value) }))} /></label>
            <div className="tasteActions"><button type="button" disabled={busyKey === dimension.key} onClick={() => void setOverride(dimension.key, drafts[dimension.key] ?? 0)}>Lưu ưu tiên</button><button type="button" disabled={busyKey === dimension.key || dimension.manualOverride === null} onClick={() => void setOverride(dimension.key, null)}>Bỏ ưu tiên</button><button type="button" className="dangerText" disabled={busyKey === dimension.key} onClick={() => void reset(dimension.key)}>Đặt lại học</button></div>
          </article>
        ))}
      </section>
      <section className="tasteHistory panel">
        <div className="panelTitle"><div><span>02</span><h2>Lịch sử học & điều khiển</h2></div><small>{history?.meta.count ?? 0} sự kiện gần nhất</small></div>
        {!history?.data.length ? <p className="mutedCopy">Chưa có sự kiện. Hãy nấu và gửi phản hồi đầu tiên.</p> : <ol>{history.data.map((event) => <li key={`${event.kind}-${event.id}`}><time>{new Date(event.createdAt).toLocaleString('vi-VN')}</time><div><strong>{LABELS[event.dimensionKey] ?? event.dimensionKey}</strong>{event.kind === 'control' ? <p>{event.control?.action === 'learning_reset' ? 'Đã đặt lại phần học' : event.control?.action === 'manual_override_cleared' ? 'Đã bỏ ưu tiên thủ công' : `Đặt ưu tiên ${valueText(event.control?.value ?? 0)}`}</p> : <><p>Phản hồi {valueText(event.signal?.value ?? 0)} · {event.signal?.recipeSlug ?? 'không rõ món'}{event.signal?.qualityFactor === 0 ? ' · không dùng để học' : ''}</p>{event.signal?.privateNote && <blockquote>“{event.signal.privateNote}”</blockquote>}</>}</div></li>)}</ol>}
      </section>
    </main>
  );
}
