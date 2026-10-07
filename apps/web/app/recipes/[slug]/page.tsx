'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiRequestError, apiRequest, getErrorMessage } from '../../../lib/api';
import { loadCurrentUser } from '../../../lib/current-user';
import type { CurrentUserContext } from '../../../lib/current-user';
import type {
  CookSessionResponse,
  PersonalizedIngredient,
  PersonalizedResponse,
  PersonalizedVersion,
  RecipeDetailResponse,
  RecipeIngredient,
  RecipeStep,
} from '../../../lib/types';

type Stage = 'detail' | 'cooking' | 'feedback' | 'done';
type IngredientView = RecipeIngredient | PersonalizedIngredient;

const feedbackChoices = [
  { value: -1, short: 'Ít hơn' },
  { value: -0.5, short: 'Hơi ít' },
  { value: 0, short: 'Vừa rồi' },
  { value: 0.5, short: 'Hơi nhiều' },
  { value: 1, short: 'Nhiều hơn' },
];

function formatQuantity(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function durationText(seconds: number | null) {
  if (!seconds) return null;
  return seconds < 60 ? `${seconds} giây` : `${Math.round(seconds / 60)} phút`;
}

function FeedbackChoice({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number) => void }) {
  return (
    <fieldset className={value === null ? 'feedbackField unanswered' : 'feedbackField answered'}>
      <legend>{label}<small>{value === null ? 'Chưa chọn' : value === 0 ? 'Đã chọn · Vừa rồi' : 'Đã chọn'}</small></legend>
      <div className="choiceGrid">
        {feedbackChoices.map((choice) => (
          <button key={choice.value} type="button" className={value === choice.value ? 'choice active' : 'choice'} onClick={() => onChange(choice.value)}>
            {choice.short}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function LoadingRecipe() {
  return <main className="shell"><div className="detailSkeleton"><i /><i /><i /><i /></div></main>;
}

export default function RecipePage() {
  const { slug } = useParams<{ slug: string }>();
  const [recipe, setRecipe] = useState<RecipeDetailResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserContext | null>(null);
  const [personalized, setPersonalized] = useState<PersonalizedVersion | null>(null);
  const [session, setSession] = useState<CookSessionResponse | null>(null);
  const [stage, setStage] = useState<Stage>('detail');
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [overall, setOverall] = useState(5);
  const [saltiness, setSaltiness] = useState<number | null>(null);
  const [garlicOnion, setGarlicOnion] = useState<number | null>(null);
  const [softness, setSoftness] = useState<number | null>(null);
  const [technicalFlags, setTechnicalFlags] = useState<string[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setError(null);
      try {
        const [recipeData, userContext] = await Promise.all([
          apiRequest<RecipeDetailResponse>(`/recipes/${slug}`),
          loadCurrentUser(),
        ]);
        if (!active) return;
        setRecipe(recipeData);
        setCurrentUser(userContext);
        try {
          const latest = await apiRequest<PersonalizedResponse>(`/users/${userContext.user.id}/recipes/${slug}/personalized-versions/latest`);
          if (active) setPersonalized(latest.data);
        } catch (cause) {
          if (!(cause instanceof ApiRequestError && cause.status === 404)) throw cause;
        }
      } catch (cause) {
        if (active) setError(getErrorMessage(cause, 'Không tải được món ăn.'));
      }
    }
    void load();
    return () => { active = false; };
  }, [slug, reloadKey]);

  const cookingPersonalized = session?.data.recipe.source === 'personalized';
  const base = recipe?.data.version;
  const visibleIngredients: IngredientView[] = useMemo(
    () => personalized?.snapshot.ingredients ?? recipe?.data.version.ingredients ?? [],
    [personalized, recipe],
  );
  const activeSteps: RecipeStep[] = useMemo(
    () => cookingPersonalized && personalized ? personalized.snapshot.steps : recipe?.data.version.steps ?? [],
    [cookingPersonalized, personalized, recipe],
  );

  async function ensurePersonalized() {
    if (!currentUser || !recipe) return;
    setBusy(true); setError(null);
    try {
      const response = await apiRequest<PersonalizedResponse>(`/users/${currentUser.user.id}/recipes/${recipe.data.slug}/personalized-versions`, { method: 'POST' });
      setPersonalized(response.data);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Chưa thể tạo công thức cá nhân lúc này.'));
    } finally { setBusy(false); }
  }

  async function startCooking(usePersonalized: boolean) {
    if (!currentUser || !recipe) return;
    setBusy(true); setError(null);
    try {
      const result = await apiRequest<CookSessionResponse>('/cook-sessions', {
        method: 'POST',
        body: JSON.stringify({
          userId: currentUser.user.id,
          recipeSlug: recipe.data.slug,
          personalizedRecipeVersionId: usePersonalized ? personalized?.id : undefined,
        }),
      });
      setSession(result); setStepIndex(0); setStage('cooking');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Chưa thể bắt đầu phiên nấu.'));
    } finally { setBusy(false); }
  }

  async function completeCurrentStep() {
    const step = activeSteps[stepIndex];
    if (!session || !step) return;
    setBusy(true); setError(null);
    try {
      await apiRequest(`/cook-sessions/${session.data.id}/events`, {
        method: 'POST',
        body: JSON.stringify({ eventType: 'step_completed', clientSeq: stepIndex + 1, clientTime: new Date().toISOString(), payload: { stepNo: step.stepNo, durationSeconds: step.durationSeconds } }),
      });
      if (stepIndex < activeSteps.length - 1) {
        setStepIndex((current) => current + 1);
      } else {
        const completed = await apiRequest<CookSessionResponse>(`/cook-sessions/${session.data.id}/complete`, { method: 'POST' });
        setSession(completed); setStage('feedback');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Tiến độ chưa được lưu. Hãy thử lại.'));
    } finally { setBusy(false); }
  }

  async function submitFeedback() {
    if (!session || !currentUser || !recipe) return;
    const dimensions = {
      ...(saltiness === null ? {} : { saltiness }),
      ...(garlicOnion === null ? {} : { garlic_onion: garlicOnion }),
      ...(softness === null ? {} : { softness }),
    };

    if (Object.keys(dimensions).length === 0) {
      setError('Hãy chọn ít nhất một cảm nhận khẩu vị. “Vừa rồi” cũng là một lựa chọn rõ ràng.');
      return;
    }

    setBusy(true); setError(null);
    try {
      await apiRequest(`/cook-sessions/${session.data.id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ overallScore: overall, dimensions, technicalFlags, privateNote: note || undefined }),
      });
      const next = await apiRequest<PersonalizedResponse>(`/users/${currentUser.user.id}/recipes/${recipe.data.slug}/personalized-versions`, { method: 'POST' });
      setPersonalized(next.data); setStage('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Phản hồi chưa được lưu. Hãy thử lại.'));
    } finally { setBusy(false); }
  }

  function toggleFlag(flag: string) {
    setTechnicalFlags((current) => current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag]);
  }

  if (error && !recipe) {
    return (
      <main className="shell narrowShell"><Link href="/" className="backLink">← Về Bếp Nhớ</Link>
        <div className="stateCard errorState"><span className="stateIcon">!</span><div><strong>Không mở được công thức</strong><p>{error}</p></div><button className="button secondary" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</button></div>
      </main>
    );
  }
  if (!recipe || !currentUser || !base) return <LoadingRecipe />;

  const currentStep = activeSteps[stepIndex];
  const hasTasteAnswer = saltiness !== null || garlicOnion !== null || softness !== null;
  const totalTime = (personalized?.snapshot.prepTimeMinutes ?? base.prepTimeMinutes ?? 0) + (personalized?.snapshot.cookTimeMinutes ?? base.cookTimeMinutes ?? 0);

  if (stage === 'cooking' && currentStep) {
    const progress = ((stepIndex + 1) / activeSteps.length) * 100;
    return (
      <main className="cookMode">
        <header className="cookTopbar">
          <Link href={`/recipes/${slug}`} className="cookBrand">BN</Link>
          <div><span>Đang nấu</span><strong>{recipe.data.title}</strong></div>
          <span className="pill personalized">{cookingPersonalized ? `Của bạn · V${session?.data.recipe.personalizedVersionNo}` : `Bản chuẩn · V${session?.data.recipe.versionNo}`}</span>
        </header>
        <div className="cookProgress"><span style={{ width: `${progress}%` }} /></div>
        <section className="cookWorkspace">
          <div className="cookStepMeta"><span>Bước {stepIndex + 1} / {activeSteps.length}</span><b>{Math.round(progress)}% hoàn thành</b></div>
          <article className="cookCard">
            <div className="stepBadge">{String(stepIndex + 1).padStart(2, '0')}</div>
            <div className="cookCopy">
              {currentStep.heatLevel && <div className="smallLabel">Lửa {currentStep.heatLevel}</div>}
              <h1>{currentStep.instruction}</h1>
              {durationText(currentStep.durationSeconds) && <div className="timerLabel"><i /> Khoảng {durationText(currentStep.durationSeconds)}</div>}
              {currentStep.tip && <aside className="tipBox"><span>Mẹo từ Bếp Nhớ</span><p>{currentStep.tip}</p></aside>}
              {error && <div className="inlineError" role="alert">{error}</div>}
            </div>
          </article>
          <div className="cookActions">
            <button className="button secondary" type="button" disabled={busy || stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>← Bước trước</button>
            <button className="button cookNext" type="button" disabled={busy} onClick={() => void completeCurrentStep()}>{busy ? 'Đang lưu…' : stepIndex === activeSteps.length - 1 ? 'Hoàn thành món' : 'Xong bước này →'}</button>
          </div>
        </section>
      </main>
    );
  }

  if (stage === 'feedback') {
    return (
      <main className="shell feedbackShell">
        <div className="completionMark">✓</div>
        <div className="smallLabel centered">Nấu xong rồi</div>
        <h1 className="feedbackTitle">Món hôm nay thế nào?</h1>
        <p className="feedbackLead">Chỉ mất khoảng 10 giây. Phản hồi của bạn giúp lần nấu sau vừa vị hơn.</p>

        <section className="feedbackCard">
          <fieldset className="feedbackField scoreField"><legend>Bạn chấm món này bao nhiêu?</legend>
            <div className="scoreChoices">{[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" className={overall === score ? 'score active' : 'score'} onClick={() => setOverall(score)}><span>★</span><b>{score}</b></button>)}</div>
          </fieldset>
          <FeedbackChoice label="Độ mặn so với ý bạn" value={saltiness} onChange={setSaltiness} />
          <FeedbackChoice label="Lượng hành, tỏi" value={garlicOnion} onChange={setGarlicOnion} />
          <FeedbackChoice label="Độ mềm của món" value={softness} onChange={setSoftness} />

          <fieldset className="feedbackField"><legend>Có sự cố khi nấu không? <small>Không dùng để học khẩu vị</small></legend>
            <div className="flagChoices">{[['burnt', 'Bị cháy'], ['undercooked', 'Chưa chín'], ['wrong_ingredient', 'Đổi nguyên liệu']].map(([flag, label]) => <button key={flag} type="button" className={technicalFlags.includes(flag) ? 'flag active' : 'flag'} onClick={() => toggleFlag(flag)}>{technicalFlags.includes(flag) ? '✓ ' : '+ '}{label}</button>)}</div>
          </fieldset>

          <label className="noteField"><span>Ghi chú riêng <small>Không bắt buộc</small></span><textarea value={note} maxLength={2000} placeholder="Ví dụ: lần sau thêm chút tiêu, kho cạn hơn…" onChange={(event) => setNote(event.target.value)} /></label>
          {error && <div className="inlineError" role="alert">{error}</div>}
          {!hasTasteAnswer && <p className="feedbackRequirement">Chọn ít nhất một cảm nhận. Bếp Nhớ sẽ không tự hiểu ô chưa chọn là “vừa”.</p>}
          <button className="button feedbackSubmit" type="button" disabled={busy || !hasTasteAnswer} onClick={() => void submitFeedback()}>{busy ? 'Bếp Nhớ đang học…' : 'Lưu và xem Bếp Nhớ đã học gì →'}</button>
        </section>
      </main>
    );
  }

  if (stage === 'done') {
    const adjustments = personalized?.snapshot.adjustments ?? [];
    return (
      <main className="shell resultShell">
        <div className="resultHero"><div className="completionMark">✓</div><div className="smallLabel light centered">Bếp Nhớ đã học thêm</div><h1>Phiên bản tiếp theo đã sẵn sàng.</h1><p>Taste DNA được cập nhật từ lần nấu vừa rồi. Mọi thay đổi đều có giới hạn và công thức cũ vẫn được giữ nguyên.</p></div>
        <section className="learningCard">
          <div className="learningHead"><div><span className="pill personalized">Công thức của bạn · V{personalized?.versionNo}</span><h2>Những gì sẽ thay đổi lần sau</h2></div><div className="maturityMini"><strong>{Math.round((personalized?.snapshot.tasteEvidence.maturityScore ?? 0) * 100)}%</strong><span>Độ trưởng thành</span></div></div>
          {adjustments.length > 0 ? <div className="adjustmentList">{adjustments.map((item) => <div key={item.ingredientSlug} className="adjustmentItem"><div><strong>{item.ingredientName}</strong><span>Từ {formatQuantity(item.baseQuantity)} {item.unit}</span></div><div className="adjustmentValue"><strong>{formatQuantity(item.quantity)} {item.unit}</strong><span>{item.deltaPercent > 0 ? '+' : ''}{item.deltaPercent}%</span></div></div>)}</div> : <div className="noAdjustment"><strong>Giữ nguyên công thức hiện tại</strong><p>Tín hiệu còn mới hoặc món đã vừa vị. Bếp Nhớ sẽ tiếp tục quan sát trước khi điều chỉnh.</p></div>}
          <p className="evidenceNote">Dựa trên {personalized?.snapshot.tasteEvidence.sampleCount ?? 0} lần nấu · Thuật toán {personalized?.algorithmVersion}</p>
        </section>
        <div className="resultActions"><button className="button" type="button" onClick={() => { setSession(null); setStepIndex(0); setStage('detail'); }}>Xem công thức mới</button><Link href="/" className="button secondary">Chọn món khác</Link></div>
      </main>
    );
  }

  const adjustments = personalized?.snapshot.adjustments ?? [];
  return (
    <main className="shell detailShell">
      <header className="detailNav"><Link href="/" className="backLink">← Về sổ công thức</Link><span className="statusDot"><i /> Công thức thử nghiệm</span></header>
      <section className="detailHero">
        <div className="detailCopy">
          <div className="eyebrow"><span /> Món Việt · {personalized ? 'Đã được Bếp Nhớ điều chỉnh' : 'Công thức chuẩn'}</div>
          <h1>{recipe.data.title}</h1>
          <p>{personalized?.snapshot.summary ?? base.summary}</p>
          <div className="detailStats"><span><b>{totalTime}</b> phút</span><span><b>{personalized?.snapshot.servings ?? base.servings}</b> phần ăn</span><span><b>{base.steps.length}</b> bước nấu</span></div>
          <div className="actions primaryActions">
            {personalized ? <button type="button" className="button" disabled={busy} onClick={() => void startCooking(true)}>Bắt đầu nấu bản của tôi →</button> : <button type="button" className="button" disabled={busy} onClick={() => void ensurePersonalized()}>{busy ? 'Đang lắng nghe khẩu vị…' : 'Tạo công thức cho tôi →'}</button>}
            <button type="button" className="button secondary" disabled={busy} onClick={() => void startCooking(false)}>Nấu bản chuẩn</button>
          </div>
          {error && <div className="inlineError" role="alert">{error}</div>}
        </div>
        <aside className="detailVisual">
          <span className="heroBowl" aria-hidden="true"><i /><i /><i /></span>
          <div className="versionSeal"><small>{personalized ? 'Phiên bản của bạn' : 'Phiên bản chuẩn'}</small><strong>V{personalized?.versionNo ?? base.versionNo}</strong></div>
        </aside>
      </section>

      {personalized && (
        <section className="personalizationBanner">
          <div><div className="smallLabel light">Bếp Nhớ đã chỉnh cho bạn</div><h2>{adjustments.length > 0 ? `${adjustments.length} nguyên liệu được tinh chỉnh vừa đủ` : 'Công thức này đang hợp khẩu vị của bạn'}</h2><p>Dựa trên {personalized.snapshot.tasteEvidence.sampleCount} lần nấu · độ trưởng thành Taste DNA {Math.round(personalized.snapshot.tasteEvidence.maturityScore * 100)}%</p></div>
          <div className="miniDiffs">{adjustments.slice(0, 3).map((item) => <span key={item.ingredientSlug}><b>{item.ingredientName}</b><i>{item.deltaPercent > 0 ? '+' : ''}{item.deltaPercent}%</i></span>)}</div>
          <button className="textButton" type="button" disabled={busy} onClick={() => void ensurePersonalized()}>{busy ? 'Đang cập nhật…' : 'Làm mới theo Taste DNA'}</button>
        </section>
      )}

      <div className="contentGrid">
        <section className="panel ingredientPanel"><div className="panelTitle"><div><span>01</span><h2>Chuẩn bị nguyên liệu</h2></div><small>{visibleIngredients.length} thứ</small></div>
          <ul className="ingredientList">{visibleIngredients.map((item) => {
            const adjusted = 'personalized' in item && item.personalized;
            return <li key={item.id} className="ingredient"><div><strong>{item.name}</strong>{item.preparation && <span>{item.preparation}</span>}</div><div className={adjusted ? 'ingredientAmount adjusted' : 'ingredientAmount'}>{adjusted && <small>{formatQuantity(item.baseQuantity)}</small>}<b>{formatQuantity(item.quantity)} {item.unit}</b></div></li>;
          })}</ul>
        </section>
        <section className="panel stepPanel"><div className="panelTitle"><div><span>02</span><h2>Từng bước vào bếp</h2></div><small>{base.steps.length} bước</small></div>
          <ol className="stepList">{(personalized?.snapshot.steps ?? base.steps).map((step) => <li key={step.stepNo} className="stepItem"><span className="stepNumber">{String(step.stepNo).padStart(2, '0')}</span><div><p>{step.instruction}</p><div className="stepMeta">{durationText(step.durationSeconds) && <span>{durationText(step.durationSeconds)}</span>}{step.heatLevel && <span>Lửa {step.heatLevel}</span>}</div>{step.tip && <aside className="tip"><b>Mẹo</b> {step.tip}</aside>}</div></li>)}</ol>
        </section>
      </div>
      <div className="stickyCook"><div><strong>{personalized ? `Bản của bạn · V${personalized.versionNo}` : `Bản chuẩn · V${base.versionNo}`}</strong><span>{totalTime} phút · {personalized?.snapshot.servings ?? base.servings} phần</span></div><button className="button" disabled={busy} onClick={() => void startCooking(Boolean(personalized))}>Bắt đầu nấu →</button></div>
      <footer className="detailFooter">Công thức cá nhân hóa bằng deterministic Taste Engine · Luôn giữ đúng phiên bản đã nấu</footer>
    </main>
  );
}
