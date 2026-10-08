'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiRequest, getErrorMessage } from '../lib/api';
import { establishDevelopmentSession, loadCurrentUser, logoutCurrentUser } from '../lib/current-user';
import type { CurrentUserContext } from '../lib/current-user';
import type { ActiveCookSessionResponse, RecipeListResponse } from '../lib/types';

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Bếp Nhớ — trang chủ">
      <span className="brandMark" aria-hidden="true">BN</span>
      <span><strong>Bếp Nhớ</strong><small>Gian bếp hiểu bạn</small></span>
    </Link>
  );
}

export default function Home() {
  const [recipes, setRecipes] = useState<RecipeListResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserContext | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeSession, setActiveSession] = useState<ActiveCookSessionResponse | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setError(null);
      try {
        const recipeData = await apiRequest<RecipeListResponse>('/recipes?limit=24');
        if (active) {
          setRecipes(recipeData);
        }
      } catch (cause) {
        if (active) setError(getErrorMessage(cause, 'Không mở được sổ công thức.'));
      }
    }

    async function loadIdentity() {
      try {
        const userContext = await loadCurrentUser();
        if (active) setCurrentUser(userContext);
        try {
          const session = await apiRequest<ActiveCookSessionResponse>('/me/cook-sessions/active');
          if (active) setActiveSession(session);
        } catch (cause) {
          if (!(cause instanceof ApiRequestError && cause.status === 404)) throw cause;
        }
      } catch (cause) {
        if (!(cause instanceof ApiRequestError && cause.status === 401) && active) {
          setError(getErrorMessage(cause, 'Không tải được thông tin tài khoản.'));
        }
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void load();
    void loadIdentity();
    return () => { active = false; };
  }, [reloadKey]);

  async function useDevelopmentAccount() {
    setAuthBusy(true); setError(null);
    try {
      setCurrentUser(await establishDevelopmentSession());
    } catch (cause) {
      setError(getErrorMessage(cause, 'Không thể mở phiên phát triển.'));
    } finally { setAuthBusy(false); setAuthChecked(true); }
  }

  async function logout() {
    setAuthBusy(true); setError(null);
    try {
      await logoutCurrentUser(currentUser?.user.id);
      setCurrentUser(null);
      setActiveSession(null);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Không thể đăng xuất.'));
    } finally { setAuthBusy(false); }
  }

  const taste = currentUser?.tasteProfile;
  const filteredRecipes = recipes?.data.filter((recipe) =>
    recipe.title.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')),
  );

  return (
    <main className="shell homeShell">
      <header className="topbar">
        <Brand />
        <nav className="topnav" aria-label="Điều hướng chính">
          <a href="#recipes">Món hôm nay</a>
          {currentUser && <Link href="/taste">Taste DNA</Link>}
          {currentUser ? (
            <button className="navAction" type="button" disabled={authBusy} onClick={() => void logout()}>Đăng xuất</button>
          ) : authChecked ? (
            <><Link href="/login">Đăng nhập</Link><Link href="/register" className="navAction">Tạo tài khoản</Link></>
          ) : null}
        </nav>
      </header>

      <section className="hero">
        <div className="heroCard">
          <div className="eyebrow"><span /> Trợ lý nấu món Việt có trí nhớ</div>
          <h1>Càng nấu, Bếp Nhớ càng <em>hiểu khẩu vị</em> của bạn.</h1>
          <p>Mỗi lần vào bếp là một lần công thức được tinh chỉnh vừa đủ — có lý do, có giới hạn và luôn giữ lại phiên bản bạn đã nấu.</p>
          <a className="button heroAction" href="#recipes">Chọn món để nấu <span aria-hidden="true">↓</span></a>
          {!currentUser && authChecked && process.env.NODE_ENV !== 'production' && (
            <button className="devSessionAction" type="button" disabled={authBusy} onClick={() => void useDevelopmentAccount()}>
              {authBusy ? 'Đang mở bếp dev…' : 'Dùng tài khoản dev'}
            </button>
          )}
          <div className="heroProof" aria-label="Đặc tính của Bếp Nhớ">
            <span><b>01</b> Công thức chuẩn</span>
            <span><b>02</b> Học sau mỗi lần nấu</span>
            <span><b>03</b> Điều chỉnh có kiểm soát</span>
          </div>
        </div>

        <aside className="tasteCard">
          <div className="tasteOrnament" aria-hidden="true">味</div>
          <div>
            <div className="smallLabel light">Taste DNA của bạn</div>
            <strong>{taste ? `${Math.round(taste.maturityScore * 100)}%` : '—'}</strong>
            <p>{taste ? 'Hồ sơ đang dần rõ nét qua từng bữa cơm.' : 'Nấu món đầu tiên để Bếp Nhớ bắt đầu học.'}</p>
          </div>
          <div className="tasteProgress" aria-hidden="true"><span style={{ width: `${Math.max(4, (taste?.maturityScore ?? 0) * 100)}%` }} /></div>
          <div className="tasteMeta"><span>{taste?.sampleCount ?? 0}</span> lần nấu đã góp vào khẩu vị</div>
          {currentUser && <Link href="/taste" className="tasteLink">Xem và điều khiển Taste DNA →</Link>}
        </aside>
      </section>

      <section id="recipes" className="recipeSection">
        <div className="sectionTitle">
          <div><div className="smallLabel">Gợi ý từ gian bếp</div><h2>Hôm nay mình nấu gì?</h2></div>
          {recipes && <p>{recipes.meta.count} công thức thử nghiệm</p>}
        </div>

        {activeSession && (
          <Link className="resumeBanner" href={`/cook/${activeSession.data.id}`}>
            <span>Đang nấu dở</span><strong>{activeSession.data.snapshot.recipe.title}</strong><b>Tiếp tục →</b>
          </Link>
        )}

        <label className="recipeSearch">
          <span>Tìm món</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ví dụ: trứng, gà, canh…" />
        </label>

        {error && (
          <div className="stateCard errorState" role="alert">
            <span className="stateIcon">!</span><div><strong>Gian bếp đang tạm gián đoạn</strong><p>{error}</p></div>
            <button className="button secondary" type="button" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</button>
          </div>
        )}

        {!error && !recipes && (
          <div className="recipeGrid" aria-label="Đang tải công thức">
            {[1, 2, 3].map((item) => <div className="recipeCard skeletonCard" key={item}><i /><i /><i /></div>)}
          </div>
        )}

        {filteredRecipes?.length === 0 && (
          <div className="stateCard"><span className="stateIcon">○</span><div><strong>Sổ công thức còn trống</strong><p>Các món Việt đầu tiên đang được chuẩn bị.</p></div></div>
        )}

        {recipes && filteredRecipes && filteredRecipes.length > 0 && (
          <div className="recipeGrid">
            {filteredRecipes.map((recipe, index) => {
              const version = recipe.latestVersion;
              const totalTime = (version?.prepTimeMinutes ?? 0) + (version?.cookTimeMinutes ?? 0);
              return (
                <Link key={recipe.id} href={`/recipes/${recipe.slug}`} className="recipeCard">
                  <div className={`recipeVisual tone${(index % 3) + 1}`}>
                    <span className="recipeIndex">0{index + 1}</span>
                    <span className="bowl" aria-hidden="true"><i /><i /><i /></span>
                    <span className="pill lightPill">Món Việt</span>
                  </div>
                  <div className="recipeBody">
                    <div><h3>{recipe.title}</h3><p>{version?.summary ?? 'Công thức nền cân bằng, rõ từng bước.'}</p></div>
                    <div className="recipeMeta">
                      {totalTime > 0 && <span><i className="clockIcon" /> {totalTime} phút</span>}
                      {version && <span>{version.servings} phần</span>}
                      <b aria-label="Mở công thức">→</b>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="siteFooter"><Brand /><p>Recipe → Cook → Feedback → Taste DNA → Công thức của riêng bạn</p></footer>
    </main>
  );
}
