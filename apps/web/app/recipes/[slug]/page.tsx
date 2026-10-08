'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { scaleIngredientQuantity } from '@bep-nho/domain';
import { ApiRequestError, apiRequest, getErrorMessage } from '../../../lib/api';
import { loadCurrentUser } from '../../../lib/current-user';
import type { CurrentUserContext } from '../../../lib/current-user';
import type {
  CookSessionResponse,
  PersonalizedIngredient,
  PersonalizedResponse,
  PersonalizedVersion,
  RecipeDetailResponse,
} from '../../../lib/types';

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
          const latest = await apiRequest<PersonalizedResponse>(`/me/recipes/${slug}/personalized-versions/latest`);
          if (active) {
            setPersonalized(latest.data);
            setServings(latest.data.snapshot.servings);
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

  const previewIngredients = useMemo(() => {
    if (!recipe) return [];
    const baseServings = personalized?.snapshot.servings ?? recipe.data.version.servings;
    const source = personalized?.snapshot.ingredients ?? recipe.data.version.ingredients;
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
  }, [personalized, recipe, servings]);

  async function createPersonalized() {
    if (!recipe) return;
    setBusy(true); setError(null);
    try {
      const response = await apiRequest<PersonalizedResponse>(`/me/recipes/${recipe.data.slug}/personalized-versions`, { method: 'POST' });
      setPersonalized(response.data);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Chưa thể tạo công thức cá nhân lúc này.'));
    } finally { setBusy(false); }
  }

  async function startCooking(usePersonalized: boolean) {
    if (!recipe) return;
    setBusy(true); setError(null);
    try {
      const response = await apiRequest<CookSessionResponse>('/cook-sessions', {
        method: 'POST',
        body: JSON.stringify({
          recipeSlug: recipe.data.slug,
          servings,
          personalizedRecipeVersionId: usePersonalized ? personalized?.id : undefined,
        }),
      });
      router.push(`/cook/${response.data.id}`);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Chưa thể bắt đầu phiên nấu.'));
      setBusy(false);
    }
  }

  if (!checked || (!recipe && !error)) {
    return <main className="shell"><div className="detailSkeleton"><i /><i /><i /><i /></div></main>;
  }
  if (!recipe) {
    return <main className="shell narrowShell"><Link href="/" className="backLink">← Về Bếp Nhớ</Link><div className="stateCard errorState"><span className="stateIcon">!</span><div><strong>Không mở được công thức</strong><p>{error}</p></div><button className="button secondary" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</button></div></main>;
  }

  const base = recipe.data.version;
  const steps = personalized?.snapshot.steps ?? base.steps;
  const totalTime = (personalized?.snapshot.prepTimeMinutes ?? base.prepTimeMinutes ?? 0)
    + (personalized?.snapshot.cookTimeMinutes ?? base.cookTimeMinutes ?? 0);
  const adjustments = personalized?.snapshot.adjustments ?? [];

  return (
    <main className="shell detailShell">
      <header className="detailNav"><Link href="/" className="backLink">← Về sổ công thức</Link><span className="statusDot"><i /> Nội dung alpha thử nghiệm</span></header>
      <section className="detailHero">
        <div className="detailCopy">
          <div className="eyebrow"><span /> Món Việt · {personalized ? 'Bản điều chỉnh của bạn' : 'Bản chuẩn'}</div>
          <h1>{recipe.data.title}</h1>
          <p>{personalized?.snapshot.summary ?? base.summary}</p>
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
                ? <button type="button" className="button" disabled={busy} onClick={() => void startCooking(true)}>Nấu bản của tôi →</button>
                : <button type="button" className="button" disabled={busy} onClick={() => void createPersonalized()}>{busy ? 'Đang chuẩn bị…' : 'Tạo công thức cho tôi →'}</button>}
              <button type="button" className="button secondary" disabled={busy} onClick={() => void startCooking(false)}>Nấu bản chuẩn</button>
            </>}
          </div>
          {error && <div className="inlineError" role="alert">{error}</div>}
        </div>
        <aside className="detailVisual"><span className="heroBowl" aria-hidden="true"><i /><i /><i /></span><div className="versionSeal"><small>{personalized ? 'Phiên bản của bạn' : 'Phiên bản chuẩn'}</small><strong>V{personalized?.versionNo ?? base.versionNo}</strong></div></aside>
      </section>

      {personalized && <section className="personalizationBanner"><div><div className="smallLabel light">Bếp Nhớ đã chỉnh cho bạn</div><h2>{adjustments.length > 0 ? `${adjustments.length} nguyên liệu được tinh chỉnh` : 'Công thức đang hợp khẩu vị của bạn'}</h2><p>Đổi số phần chỉ thay bản xem trước, không tạo thêm phiên bản cá nhân hóa.</p></div><button className="textButton" type="button" disabled={busy} onClick={() => void createPersonalized()}>Làm mới theo Taste DNA</button></section>}

      <div className="contentGrid">
        <section className="panel ingredientPanel"><div className="panelTitle"><div><span>01</span><h2>Chuẩn bị nguyên liệu</h2></div><small>{previewIngredients.length} thứ</small></div><ul className="ingredientList">{previewIngredients.map((item) => <li key={item.id} className="ingredient"><div><strong>{item.name}</strong>{item.preparation && <span>{item.preparation}</span>}{item.note && <span>{item.note}</span>}</div><div className={Math.abs(item.personalizationFactor - 1) > 0.000001 ? 'ingredientAmount adjusted' : 'ingredientAmount'}><b>{formatQuantity(item.quantity)} {item.unit}</b></div></li>)}</ul></section>
        <section className="panel stepPanel"><div className="panelTitle"><div><span>02</span><h2>Từng bước vào bếp</h2></div><small>{steps.length} bước</small></div><ol className="stepList">{steps.map((step) => <li key={step.stepNo} className="stepItem"><span className="stepNumber">{String(step.stepNo).padStart(2, '0')}</span><div><p>{step.instruction}</p><div className="stepMeta">{durationText(step.durationSeconds) && <span>{durationText(step.durationSeconds)}</span>}{step.heatLevel && <span>Lửa {step.heatLevel}</span>}</div>{step.tip && <aside className="tip"><b>Mẹo</b> {step.tip}</aside>}</div></li>)}</ol></section>
      </div>
      <div className="stickyCook"><div><strong>{personalized ? `Bản của bạn · V${personalized.versionNo}` : `Bản chuẩn · V${base.versionNo}`}</strong><span>{totalTime} phút · {servings} phần</span></div>{currentUser ? <button className="button" disabled={busy} onClick={() => void startCooking(Boolean(personalized))}>Bắt đầu nấu →</button> : <Link className="button" href="/login">Đăng nhập để nấu →</Link>}</div>
      <footer className="detailFooter">Nội dung alpha thử nghiệm, chưa qua thẩm định ẩm thực chuyên môn · Phiên nấu luôn giữ đúng snapshot đã bắt đầu</footer>
    </main>
  );
}
