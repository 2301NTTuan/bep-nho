'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  decisionSourceVersionId,
  distinctPersonalizedVersionChoices,
  scaleIngredientQuantity,
  selectDefaultPersonalizedVersion,
} from '@bep-nho/domain';
import { API_BASE, ApiRequestError, apiRequest, getErrorMessage } from '../../../lib/api';
import { loadCurrentUser } from '../../../lib/current-user';
import type { CurrentUserContext } from '../../../lib/current-user';
import type {
  CookSessionResponse,
  PersonalizedIngredient,
  PersonalizedAdjustmentDecisionResponse,
  PersonalizedAdjustmentDecisionsResponse,
  PersonalizationOverviewResponse,
  PersonalizedResponse,
  PersonalizedVersion,
  RecipeDetailResponse,
} from '../../../lib/types';

type FamilyVersion = {
  id: string;
  versionNo: number;
  algorithmVersion: 'family-personalize-v1';
  reused: boolean;
  familyTaste: { activeMemberCount: number; dimensions: Array<{ key: string; score: number; confidence: number }> };
  snapshot: PersonalizedVersion['snapshot'];
};

function formatQuantity(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function durationText(seconds: number | null) {
  if (!seconds) return null;
  return seconds < 60 ? `${seconds} giây` : `${Math.round(seconds / 60)} phút`;
}

export default function RecipePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeDetailResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserContext | null>(null);
  const [personalized, setPersonalized] = useState<PersonalizedVersion | null>(null);
  const [familyVersion, setFamilyVersion] = useState<FamilyVersion | null>(null);
  const [hasHousehold, setHasHousehold] = useState(false);
  const [overview, setOverview] = useState<PersonalizationOverviewResponse['data'] | null>(null);
  const [decisions, setDecisions] = useState<PersonalizedAdjustmentDecisionsResponse['data']>([]);
  const [editQuantities, setEditQuantities] = useState<Record<string, string>>({});
  const [servings, setServings] = useState(2);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setError(null);
      try {
        const detail = await apiRequest<RecipeDetailResponse>(`/recipes/${slug}`);
        if (!active) return;
        setRecipe(detail);
        setServings(detail.data.version.servings);
        try {
          const user = await loadCurrentUser();
          if (!active) return;
          setCurrentUser(user);
          try {
            await apiRequest('/me/household');
            if (active) setHasHousehold(true);
          } catch (householdCause) {
            if (!(householdCause instanceof ApiRequestError && householdCause.status === 404)) throw householdCause;
          }
          const latest = await apiRequest<PersonalizationOverviewResponse>(`/me/recipes/${slug}/personalized-versions/overview`);
          if (active) {
            setOverview(latest.data);
            const selected = selectDefaultPersonalizedVersion(latest.data);
            setPersonalized(selected);
            if (selected) setServings(selected.snapshot.servings);
          }
        } catch (cause) {
          if (!(cause instanceof ApiRequestError && (cause.status === 401 || cause.status === 404))) throw cause;
        }
      } catch (cause) {
        if (active) setError(getErrorMessage(cause, 'Không tải được món ăn.'));
      } finally {
        if (active) setChecked(true);
      }
    }
    void load();
    return () => { active = false; };
  }, [slug, reloadKey]);

  useEffect(() => {
    let active = true;
    const versionId = decisionSourceVersionId(personalized);
    if (!versionId) {
      setDecisions([]);
      return () => { active = false; };
    }
    void apiRequest<PersonalizedAdjustmentDecisionsResponse>(
      `/me/recipes/${slug}/personalized-versions/${versionId}/decisions`,
    ).then((response) => {
      if (active) setDecisions(response.data);
    }).catch(() => {
      if (active) setDecisions([]);
    });
    return () => { active = false; };
  }, [personalized, slug]);

  const previewIngredients = useMemo(() => {
    if (!recipe) return [];
    const baseServings = familyVersion?.snapshot.servings ?? personalized?.snapshot.servings ?? recipe.data.version.servings;
    const source = familyVersion?.snapshot.ingredients ?? personalized?.snapshot.ingredients ?? recipe.data.version.ingredients;
    return source.map((item) => {
      const personalizedItem = item as PersonalizedIngredient;
      const canonicalQuantity = 'baseQuantity' in item ? personalizedItem.baseQuantity : item.quantity;
      const factor = 'personalizationFactor' in item
        ? personalizedItem.personalizationFactor
        : 'baseQuantity' in item && personalizedItem.baseQuantity > 0
          ? personalizedItem.quantity / personalizedItem.baseQuantity
          : 1;
      const scaled = scaleIngredientQuantity(
        { ...item, quantity: canonicalQuantity },
        baseServings,
        servings,
        factor,
      );
      return { ...item, ...scaled };
    });
  }, [familyVersion, personalized, recipe, servings]);

  async function createPersonalized() {
    if (!recipe) return;
    setBusy(true); setError(null);
    try {
      const response = await apiRequest<PersonalizedResponse>(`/me/recipes/${recipe.data.slug}/personalized-versions`, { method: 'POST' });
      setPersonalized(response.data);
      setFamilyVersion(null);
      setServings(response.data.snapshot.servings);
      const refreshed = await apiRequest<PersonalizationOverviewResponse>(`/me/recipes/${recipe.data.slug}/personalized-versions/overview`);
      setOverview(refreshed.data);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Chưa thể tạo công thức cá nhân lúc này.'));
    } finally { setBusy(false); }
  }

  async function createFamilyVersion() {
    if (!recipe) return;
    setBusy(true); setError(null);
    try {
      const response = await apiRequest<{ data: FamilyVersion }>(`/me/household/recipes/${recipe.data.slug}/personalized-versions`, { method: 'POST' });
      setFamilyVersion(response.data);
      setServings(response.data.snapshot.servings);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Chưa thể tạo gợi ý Family Taste lúc này.'));
    } finally { setBusy(false); }
  }

  async function startFamilyCooking(version: FamilyVersion) {
    if (!recipe) return;
    setBusy(true); setError(null);
    try {
      const response = await apiRequest<CookSessionResponse>('/cook-sessions', {
        method: 'POST',
        body: JSON.stringify({ recipeSlug: recipe.data.slug, servings, householdPersonalizedRecipeVersionId: version.id }),
      });
      router.push(`/cook/${response.data.id}`);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Chưa thể bắt đầu phiên nấu cho gia đình.'));
      setBusy(false);
    }
  }

  async function startCooking(version: PersonalizedVersion | null) {
    if (!recipe) return;
    setBusy(true); setError(null);
    try {
      const response = await apiRequest<CookSessionResponse>('/cook-sessions', {
        method: 'POST',
        body: JSON.stringify({
          recipeSlug: recipe.data.slug,
          servings,
          personalizedRecipeVersionId: version?.id,
        }),
      });
      router.push(`/cook/${response.data.id}`);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Chưa thể bắt đầu phiên nấu.'));
      setBusy(false);
    }
  }

  async function pinBest(version: PersonalizedVersion) {
    if (!recipe) return;
    setBusy(true); setError(null);
    try {
      await apiRequest(`/me/recipes/${recipe.data.slug}/personalized-versions/best`, {
        method: 'PUT', body: JSON.stringify({ personalizedRecipeVersionId: version.id }),
      });
      const refreshed = await apiRequest<PersonalizationOverviewResponse>(`/me/recipes/${recipe.data.slug}/personalized-versions/overview`);
      setOverview(refreshed.data);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Không lưu được bản tốt nhất.'));
    } finally { setBusy(false); }
  }

  async function unpinBest() {
    if (!recipe) return;
    setBusy(true); setError(null);
    try {
      await apiRequest(`/me/recipes/${recipe.data.slug}/personalized-versions/best`, { method: 'DELETE' });
      const refreshed = await apiRequest<PersonalizationOverviewResponse>(`/me/recipes/${recipe.data.slug}/personalized-versions/overview`);
      setOverview(refreshed.data);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Không bỏ ghim được bản tốt nhất.'));
    } finally { setBusy(false); }
  }

  async function reviewAdjustment(ingredientSlug: string, action: 'ACCEPT' | 'REJECT' | 'EDIT') {
    const sourceVersionId = decisionSourceVersionId(personalized);
    if (!recipe || !sourceVersionId) return;
    setBusy(true); setError(null);
    try {
      const quantity = action === 'EDIT' ? Number(editQuantities[ingredientSlug]) : undefined;
      const response = await apiRequest<PersonalizedAdjustmentDecisionResponse>(
        `/me/recipes/${recipe.data.slug}/personalized-versions/${sourceVersionId}/adjustments/${ingredientSlug}/decisions`,
        { method: 'POST', body: JSON.stringify({ action, ...(action === 'EDIT' ? { quantity } : {}) }) },
      );
      if (response.data.resultVersion) {
        setPersonalized(response.data.resultVersion);
        setDecisions([]);
      } else {
        const refreshedDecisions = await apiRequest<PersonalizedAdjustmentDecisionsResponse>(
          `/me/recipes/${recipe.data.slug}/personalized-versions/${sourceVersionId}/decisions`,
        );
        setDecisions(refreshedDecisions.data);
      }
      const refreshed = await apiRequest<PersonalizationOverviewResponse>(`/me/recipes/${recipe.data.slug}/personalized-versions/overview`);
      setOverview(refreshed.data);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Không ghi nhận được lựa chọn điều chỉnh.'));
    } finally { setBusy(false); }
  }

  if (!checked || (!recipe && !error)) {
    return <main className="shell"><div className="detailSkeleton"><i /><i /><i /><i /></div></main>;
  }
  if (!recipe) {
    return <main className="shell narrowShell"><Link href="/" className="backLink">← Về Bếp Nhớ</Link><div className="stateCard errorState"><span className="stateIcon">!</span><div><strong>Không mở được công thức</strong><p>{error}</p></div><button className="button secondary" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</button></div></main>;
  }

  const base = recipe.data.version;
  const activeSnapshot = familyVersion?.snapshot ?? personalized?.snapshot;
  const steps = activeSnapshot?.steps ?? base.steps;
  const totalTime = (activeSnapshot?.prepTimeMinutes ?? base.prepTimeMinutes ?? 0)
    + (activeSnapshot?.cookTimeMinutes ?? base.cookTimeMinutes ?? 0);
  const adjustments = activeSnapshot?.adjustments ?? [];
  const personalAdjustments = personalized?.snapshot.adjustments ?? [];
  const best = overview?.bestVersion ?? null;
  const versionChoices = overview ? distinctPersonalizedVersionChoices(overview) : [];
  const resolvedIngredientSlugs = new Set(decisions.map((decision) => decision.ingredientSlug));
  const reviewableAdjustments = (personalized?.snapshot.adjustments ?? []).filter((item) =>
    (item.reviewStatus === undefined || item.reviewStatus === 'pending')
    && !resolvedIngredientSlugs.has(item.ingredientSlug));
  const personalLabel = personalized
    ? best?.id === personalized.id ? 'Bản tốt nhất của bạn' : personalized.originType === 'taste_engine' ? 'Gợi ý Taste DNA' : 'Bản bạn đã chỉnh'
    : 'Bản chuẩn';
  const activeLabel = familyVersion ? 'Gợi ý Family Taste' : personalLabel;

  return (
    <main className="shell detailShell">
      <header className="detailNav"><Link href="/" className="backLink">← Về sổ công thức</Link><span className="statusDot"><i /> Nội dung alpha thử nghiệm</span></header>
      <section className="detailHero">
        <div className="detailCopy">
          <div className="eyebrow"><span /> Món Việt · {activeLabel}</div>
          <h1>{recipe.data.title}</h1>
          <p>{activeSnapshot?.summary ?? base.summary}</p>
          <div className="detailStats"><span><b>{totalTime}</b> phút</span><span><b>{servings}</b> phần ăn</span><span><b>{steps.length}</b> bước nấu</span></div>
          <div className="servingPicker" aria-label="Chọn số phần ăn">
            <button type="button" disabled={servings <= 1} onClick={() => setServings((value) => Math.max(1, value - 1))}>−</button>
            <strong>{servings} phần</strong>
            <button type="button" disabled={servings >= 8} onClick={() => setServings((value) => Math.min(8, value + 1))}>+</button>
          </div>
          <p className="scalingNote">Xem trước theo số phần: định lượng được làm tròn thực tế; gia vị và chất béo tăng thận trọng.</p>
          <div className="actions primaryActions">
            {!currentUser ? <><Link href="/login" className="button">Đăng nhập để bắt đầu nấu →</Link><Link href="/register" className="button secondary">Tạo tài khoản</Link></> : <>
              {personalized
                ? <button type="button" className="button" disabled={busy} onClick={() => void startCooking(personalized)}>Nấu bản cá nhân →</button>
                : <button type="button" className="button" disabled={busy} onClick={() => void createPersonalized()}>{busy ? 'Đang chuẩn bị…' : 'Tạo công thức cho tôi →'}</button>}
              <button type="button" className="button secondary" disabled={busy} onClick={() => void startCooking(null)}>Nấu bản chuẩn</button>
              {hasHousehold && <button type="button" className="button secondary" disabled={busy} onClick={() => familyVersion ? void startFamilyCooking(familyVersion) : void createFamilyVersion()}>{familyVersion ? 'Nấu bản Family Taste →' : 'Gợi ý cho gia đình'}</button>}
            </>}
          </div>
          {error && <div className="inlineError" role="alert">{error}</div>}
        </div>
        <aside className="detailVisual">{base.heroMedia ? <img className="detailHeroImage" src={`${API_BASE.replace(/\/v1$/, '')}${base.heroMedia.url}`} alt={base.heroMedia.alt ?? recipe.data.title} /> : <span className="heroBowl" aria-hidden="true"><i /><i /><i /></span>}<div className="versionSeal"><small>{familyVersion ? 'Phiên bản gia đình' : personalized ? 'Phiên bản của bạn' : 'Phiên bản chuẩn'}</small><strong>V{familyVersion?.versionNo ?? personalized?.versionNo ?? base.versionNo}</strong></div></aside>
      </section>

      {familyVersion && <section className="personalizationBanner familyBanner"><div><div className="smallLabel light">Family Taste · {familyVersion.familyTaste.activeMemberCount} thành viên</div><h2>{adjustments.length > 0 ? `${adjustments.length} nguyên liệu được tinh chỉnh cho cả nhà` : 'Bản chuẩn đã phù hợp với Family Taste'}</h2><p>Family Taste dùng điểm tổng hợp hiện tại; phản hồi sau phiên nấu chỉ cập nhật Taste DNA cá nhân của người nấu.</p></div><button className="textButton" type="button" disabled={busy} onClick={() => void createFamilyVersion()}>Làm mới theo Family Taste</button></section>}

      {personalized && <section className="personalizationBanner"><div><div className="smallLabel light">{personalLabel}</div><h2>{personalAdjustments.length > 0 ? `${personalAdjustments.length} nguyên liệu được tinh chỉnh` : 'Công thức đang hợp khẩu vị của bạn'}</h2><p>Gợi ý mới không tự thay “Bản tốt nhất”; phiên nấu luôn dùng đúng version bạn chọn.</p></div><div className="versionChoices">{versionChoices.map((choice) => <button key={choice.version.id} type="button" disabled={busy || choice.version.id === personalized.id} onClick={() => { setPersonalized(choice.version); setServings(choice.version.snapshot.servings); }}>{choice.label} · V{choice.version.versionNo}</button>)}{best?.id === personalized.id ? <button type="button" disabled={busy} onClick={() => void unpinBest()}>Bỏ ghim bản tốt nhất</button> : <button type="button" disabled={busy} onClick={() => void pinBest(personalized)}>Lưu làm bản tốt nhất</button>}</div><button className="textButton" type="button" disabled={busy} onClick={() => void createPersonalized()}>Làm mới gợi ý theo Taste DNA</button></section>}

      {personalized && reviewableAdjustments.length > 0 && <section className="adjustmentReview panel"><div className="panelTitle"><div><span>✓</span><h2>Duyệt các thay đổi còn lại</h2></div><small>{personalLabel} · V{personalized.versionNo}</small></div><p className="mutedCopy">Mỗi lựa chọn tiếp theo được áp dụng lên đúng bản đang xem. Chấp nhận chỉ ghi nhận; từ chối hoặc sửa sẽ tạo hay tái dùng một version bất biến.</p><div className="reviewList">{reviewableAdjustments.map((item) => <article key={item.ingredientSlug}><div><strong>{item.ingredientName}</strong><span>{formatQuantity(item.baseQuantity)} → {formatQuantity(item.quantity)} {item.unit}</span></div><div className="reviewActions"><button type="button" disabled={busy} onClick={() => void reviewAdjustment(item.ingredientSlug, 'ACCEPT')}>Giữ thay đổi</button><button type="button" disabled={busy} onClick={() => void reviewAdjustment(item.ingredientSlug, 'REJECT')}>Hoàn tác</button><label><span>Chỉnh lượng</span><input inputMode="decimal" placeholder={formatQuantity(item.quantity)} value={editQuantities[item.ingredientSlug] ?? ''} onChange={(event) => setEditQuantities((current) => ({ ...current, [item.ingredientSlug]: event.target.value }))} /></label><button type="button" disabled={busy || !editQuantities[item.ingredientSlug]} onClick={() => void reviewAdjustment(item.ingredientSlug, 'EDIT')}>Lưu chỉnh</button></div></article>)}</div></section>}

      <div className="contentGrid">
        <section className="panel ingredientPanel"><div className="panelTitle"><div><span>01</span><h2>Chuẩn bị nguyên liệu</h2></div><small>{previewIngredients.length} thứ</small></div><ul className="ingredientList">{previewIngredients.map((item) => <li key={item.id} className="ingredient"><div><strong>{item.name}</strong>{item.preparation && <span>{item.preparation}</span>}{item.note && <span>{item.note}</span>}</div><div className={Math.abs(item.personalizationFactor - 1) > 0.000001 ? 'ingredientAmount adjusted' : 'ingredientAmount'}><b>{formatQuantity(item.quantity)} {item.unit}</b></div></li>)}</ul></section>
        <section className="panel stepPanel"><div className="panelTitle"><div><span>02</span><h2>Từng bước vào bếp</h2></div><small>{steps.length} bước</small></div><ol className="stepList">{steps.map((step) => <li key={step.stepNo} className="stepItem"><span className="stepNumber">{String(step.stepNo).padStart(2, '0')}</span><div><p>{step.instruction}</p><div className="stepMeta">{durationText(step.durationSeconds) && <span>{durationText(step.durationSeconds)}</span>}{step.heatLevel && <span>Lửa {step.heatLevel}</span>}</div>{step.tip && <aside className="tip"><b>Mẹo</b> {step.tip}</aside>}</div></li>)}</ol></section>
      </div>
      <div className="stickyCook"><div><strong>{familyVersion ? `${activeLabel} · V${familyVersion.versionNo}` : personalized ? `${activeLabel} · V${personalized.versionNo}` : `Bản chuẩn · V${base.versionNo}`}</strong><span>{totalTime} phút · {servings} phần</span></div>{currentUser ? <button className="button" disabled={busy} onClick={() => familyVersion ? void startFamilyCooking(familyVersion) : void startCooking(personalized)}>Bắt đầu nấu →</button> : <Link className="button" href="/login">Đăng nhập để nấu →</Link>}</div>
      <footer className="detailFooter">Nội dung alpha thử nghiệm, chưa qua thẩm định ẩm thực chuyên môn · Phiên nấu luôn giữ đúng snapshot đã bắt đầu</footer>
    </main>
  );
}
