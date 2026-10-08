'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  completedStepNumbers,
  currentStepIndex,
  nextClientSequence,
  orderCookEvents,
  remainingTimerSeconds,
} from '@bep-nho/domain';
import type { QueuedCookEvent, SequencedCookEvent } from '@bep-nho/domain';
import { apiRequest, getErrorMessage } from '../../../lib/api';
import { queueCookEvent, queuedCookEvents, syncCookQueue } from '../../../lib/cook-event-queue';
import { loadCurrentUser } from '../../../lib/current-user';
import type { CurrentUserContext } from '../../../lib/current-user';
import type { CookSessionResponse, PersonalizedResponse } from '../../../lib/types';

const feedbackChoices = [
  { value: -1, label: 'Ít hơn' }, { value: -0.5, label: 'Hơi ít' },
  { value: 0, label: 'Vừa rồi' }, { value: 0.5, label: 'Hơi nhiều' },
  { value: 1, label: 'Nhiều hơn' },
];

function formatQuantity(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function clockText(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function FeedbackChoice({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number) => void }) {
  return <fieldset className={value === null ? 'feedbackField unanswered' : 'feedbackField answered'}><legend>{label}<small>{value === null ? 'Chưa chọn' : 'Đã chọn'}</small></legend><div className="choiceGrid">{feedbackChoices.map((choice) => <button key={choice.value} type="button" className={value === choice.value ? 'choice active' : 'choice'} onClick={() => onChange(choice.value)}>{choice.label}</button>)}</div></fieldset>;
}

export default function CookPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<CurrentUserContext | null>(null);
  const [session, setSession] = useState<CookSessionResponse | null>(null);
  const [queued, setQueued] = useState<QueuedCookEvent[]>([]);
  const [now, setNow] = useState(Date.now());
  const [stage, setStage] = useState<'cooking' | 'feedback' | 'done'>('cooking');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'online' | 'saving' | 'syncing' | 'saved' | 'offline'>('online');
  const [error, setError] = useState<string | null>(null);
  const [overall, setOverall] = useState(5);
  const [saltiness, setSaltiness] = useState<number | null>(null);
  const [garlicOnion, setGarlicOnion] = useState<number | null>(null);
  const [softness, setSoftness] = useState<number | null>(null);
  const [technicalFlags, setTechnicalFlags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const timerCompletion = useRef<string | null>(null);

  const refresh = useCallback(async (currentUser: CurrentUserContext) => {
    const [remote, local] = await Promise.all([
      apiRequest<CookSessionResponse>(`/cook-sessions/${id}`),
      queuedCookEvents(currentUser.user.id),
    ]);
    setSession(remote);
    setQueued(local.filter((event) => event.cookSessionId === id));
    if (remote.data.status === 'completed') setStage('feedback');
  }, [id]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const current = await loadCurrentUser();
        if (!active) return;
        setUser(current);
        await syncCookQueue(current.user.id);
        if (active) await refresh(current);
      } catch (cause) {
        if (active) setError(getErrorMessage(cause, 'Không mở được phiên nấu.'));
      }
    }
    void load();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const online = () => {
      void syncCookQueue(user.user.id).then(() => refresh(user)).catch(() => undefined);
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [refresh, user]);

  const events = useMemo(() => {
    const server = session?.data.events ?? [];
    return orderCookEvents([...server, ...queued] as SequencedCookEvent[]);
  }, [queued, session]);
  const snapshot = session?.data.snapshot;
  const steps = snapshot?.steps ?? [];
  const completed = completedStepNumbers(events);
  const stepIndex = currentStepIndex(steps.map((step) => step.stepNo), events);
  const currentStep = steps[stepIndex];
  const remaining = currentStep ? remainingTimerSeconds(currentStep.stepNo, events, now) : null;

  const emit = useCallback(async (eventType: string, payload: Record<string, unknown>) => {
    if (!user || !session) return false;
    setSyncState('saving');
    const currentLocal = await queuedCookEvents(user.user.id);
    const localForSession = currentLocal.filter((event) => event.cookSessionId === session.data.id);
    const clientSeq = nextClientSequence(session.data.events, localForSession);
    const event: QueuedCookEvent = {
      id: `${session.data.id}:${clientSeq}`,
      userId: user.user.id,
      cookSessionId: session.data.id,
      eventType,
      clientSeq,
      clientTime: new Date().toISOString(),
      payload,
      createdAt: new Date().toISOString(),
    };
    await queueCookEvent(event);
    setQueued((current) => orderCookEvents([...current, event]));
    setSyncState('syncing');
    const result = await syncCookQueue(user.user.id);
    if (result.retained > 0) {
      setSyncState(result.stopped === 'retry' ? 'offline' : 'online');
      if (result.stopped === 'auth') {
        setError('Phiên đăng nhập đã hết hạn. Đăng nhập lại trước khi đồng bộ tiến độ.');
      } else if (result.stopped === 'rejected') {
        setError('Máy chủ từ chối một thay đổi. Tiến độ vẫn được giữ trên thiết bị; hãy tải lại phiên trước khi thử tiếp.');
      } else {
        setNotice('Đang ngoại tuyến — tiến độ đã lưu trên thiết bị và sẽ đồng bộ theo thứ tự.');
      }
      return false;
    }
    setSyncState('saved');
    setNotice(null);
    await refresh(user);
    return true;
  }, [refresh, session, user]);

  useEffect(() => {
    if (!currentStep || remaining !== 0) return;
    const ordered = orderCookEvents(events);
    const lastStart = [...ordered].reverse().find((event) => event.eventType === 'timer_started' && (event.payload as { stepNo?: number }).stepNo === currentStep.stepNo);
    const hasCompletion = lastStart && ordered.some((event) => event.eventType === 'timer_completed' && event.clientSeq > lastStart.clientSeq && (event.payload as { stepNo?: number }).stepNo === currentStep.stepNo);
    const key = lastStart ? `${currentStep.stepNo}:${lastStart.clientSeq}` : null;
    if (key && !hasCompletion && timerCompletion.current !== key) {
      timerCompletion.current = key;
      void emit('timer_completed', { stepNo: currentStep.stepNo });
    }
  }, [currentStep, emit, events, remaining]);

  async function completeSession() {
    if (!user || !session) return;
    setBusy(true); setError(null);
    try {
      const sync = await syncCookQueue(user.user.id);
      if (sync.retained > 0) {
        setNotice('Đã lưu bước cuối trên thiết bị. Kết nối mạng để hoàn tất phiên nấu.');
        return;
      }
      const completedSession = await apiRequest<CookSessionResponse>(`/cook-sessions/${session.data.id}/complete`, { method: 'POST' });
      setSession(completedSession); setStage('feedback'); setNotice(null);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Chưa thể hoàn tất phiên nấu.'));
    } finally { setBusy(false); }
  }

  async function submitFeedback() {
    if (!session || !snapshot) return;
    const dimensions = {
      ...(saltiness === null ? {} : { saltiness }),
      ...(garlicOnion === null ? {} : { garlic_onion: garlicOnion }),
      ...(softness === null ? {} : { softness }),
    };
    if (Object.keys(dimensions).length === 0) {
      setError('Hãy chọn ít nhất một cảm nhận khẩu vị.'); return;
    }
    setBusy(true); setError(null);
    try {
      await apiRequest(`/cook-sessions/${session.data.id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ overallScore: overall, dimensions, technicalFlags, privateNote: note || undefined }),
      });
      await apiRequest<PersonalizedResponse>(`/me/recipes/${snapshot.recipe.slug}/personalized-versions`, { method: 'POST' });
      setStage('done');
    } catch (cause) {
      setError(getErrorMessage(cause, 'Phản hồi chưa được lưu.'));
    } finally { setBusy(false); }
  }

  if (error && !session) return <main className="shell narrowShell"><Link href="/" className="backLink">← Về Bếp Nhớ</Link><div className="stateCard errorState"><span className="stateIcon">!</span><div><strong>Không mở được phiên nấu</strong><p>{error}</p></div></div></main>;
  if (!session || !snapshot || !currentStep) return <main className="shell"><div className="detailSkeleton"><i /><i /><i /><i /></div></main>;

  if (stage === 'done') return <main className="shell resultShell"><div className="resultHero"><div className="completionMark">✓</div><div className="smallLabel light centered">Bếp Nhớ đã học thêm</div><h1>Phiên bản tiếp theo đã sẵn sàng.</h1><p>Phản hồi đã được lưu; snapshot phiên vừa nấu vẫn bất biến.</p></div><div className="resultActions"><Link className="button" href={`/recipes/${snapshot.recipe.slug}`}>Xem công thức mới</Link><Link className="button secondary" href="/">Chọn món khác</Link></div></main>;

  if (stage === 'feedback') {
    const hasAnswer = saltiness !== null || garlicOnion !== null || softness !== null;
    return <main className="shell feedbackShell"><div className="completionMark">✓</div><div className="smallLabel centered">Nấu xong rồi</div><h1 className="feedbackTitle">Món hôm nay thế nào?</h1><p className="feedbackLead">Phản hồi giúp lần nấu sau vừa vị hơn.</p><section className="feedbackCard"><fieldset className="feedbackField scoreField"><legend>Bạn chấm món này bao nhiêu?</legend><div className="scoreChoices">{[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" className={overall === score ? 'score active' : 'score'} onClick={() => setOverall(score)}><span>★</span><b>{score}</b></button>)}</div></fieldset><FeedbackChoice label="Độ mặn" value={saltiness} onChange={setSaltiness} /><FeedbackChoice label="Lượng hành, tỏi" value={garlicOnion} onChange={setGarlicOnion} /><FeedbackChoice label="Độ mềm" value={softness} onChange={setSoftness} /><fieldset className="feedbackField"><legend>Có sự cố khi nấu không?<small>Không dùng để học khẩu vị</small></legend><div className="flagChoices">{[['burnt', 'Bị cháy'], ['undercooked', 'Chưa chín'], ['wrong_ingredient', 'Đổi nguyên liệu']].map(([flag, label]) => <button key={flag} type="button" className={technicalFlags.includes(flag) ? 'flag active' : 'flag'} onClick={() => setTechnicalFlags((current) => current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag])}>{technicalFlags.includes(flag) ? '✓ ' : '+ '}{label}</button>)}</div></fieldset><label className="noteField"><span>Ghi chú riêng <small>Không bắt buộc</small></span><textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></label>{error && <div className="inlineError">{error}</div>}<button className="button feedbackSubmit" type="button" disabled={busy || !hasAnswer} onClick={() => void submitFeedback()}>{busy ? 'Đang lưu…' : 'Lưu phản hồi →'}</button></section></main>;
  }

  const progress = (completed.size / steps.length) * 100;
  const started = events.some((event) => event.eventType === 'step_started' && (event.payload as { stepNo?: number }).stepNo === currentStep.stepNo);
  const allCompleted = steps.every((step) => completed.has(step.stepNo));
  const syncLabel = { online: 'Online', saving: 'Đang lưu…', syncing: 'Đang đồng bộ…', saved: 'Đã lưu', offline: 'Offline · đã lưu cục bộ' }[syncState];
  return <main className="cookMode"><header className="cookTopbar"><Link href={`/recipes/${snapshot.recipe.slug}`} className="cookBrand">BN</Link><div><span>Đang nấu · {snapshot.servings} phần</span><strong>{snapshot.recipe.title}</strong></div><span className={`syncStatus ${syncState}`}>{syncLabel}</span><span className="pill personalized">{snapshot.personalizedVersion ? `Của bạn · V${snapshot.personalizedVersion.versionNo}` : `Bản chuẩn · V${snapshot.canonicalVersion.versionNo}`}</span></header><div className="cookProgress"><span style={{ width: `${progress}%` }} /></div><section className="cookWorkspace">{notice && <div className="offlineNotice">{notice}</div>}<div className="cookStepMeta"><span>Bước {stepIndex + 1} / {steps.length}</span><b>{completed.size} bước đã xong · {queued.length} chờ đồng bộ</b></div><div className="cookLayout"><article className="cookCard"><div className="stepBadge">{String(currentStep.stepNo).padStart(2, '0')}</div><div className="cookCopy">{currentStep.heatLevel && <div className="smallLabel">Lửa {currentStep.heatLevel}</div>}<h1>{currentStep.instruction}</h1>{currentStep.durationSeconds && <div className="timerControls">{remaining === null ? <button className="timerButton" type="button" onClick={() => void emit('timer_started', { stepNo: currentStep.stepNo, durationSeconds: currentStep.durationSeconds })}>Bắt đầu hẹn giờ · {clockText(currentStep.durationSeconds)}</button> : <strong className={remaining === 0 ? 'timerDone' : 'timerClock'}>{remaining === 0 ? 'Hết giờ' : clockText(remaining)}</strong>}</div>}{currentStep.tip && <aside className="tipBox"><span>Mẹo từ Bếp Nhớ</span><p>{currentStep.tip}</p></aside>}{error && <div className="inlineError">{error}</div>}</div></article><aside className="cookIngredients"><div className="smallLabel">Snapshot nguyên liệu</div><ul>{snapshot.ingredients.map((item) => <li key={item.id}><span>{item.name}</span><b>{formatQuantity(item.quantity)} {item.unit}</b></li>)}</ul></aside></div><div className="cookActions"><Link className="button secondary" href={`/recipes/${snapshot.recipe.slug}`}>Thoát màn hình</Link>{!started && <button className="button secondary" type="button" onClick={() => void emit('step_started', { stepNo: currentStep.stepNo })}>Bắt đầu bước</button>}{allCompleted ? <button className="button cookNext" type="button" disabled={busy} onClick={() => void completeSession()}>Hoàn thành món →</button> : <button className="button cookNext" type="button" onClick={() => void emit('step_completed', { stepNo: currentStep.stepNo })}>Xong bước này →</button>}</div></section></main>;
}
