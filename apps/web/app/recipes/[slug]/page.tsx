'use client';

import Link from 'next/link';

import {
  useParams,
} from 'next/navigation';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ApiRequestError,
  apiRequest,
} from '../../../lib/api';

import type {
  CookSessionResponse,
  DevBootstrapResponse,
  PersonalizedResponse,
  PersonalizedVersion,
  RecipeDetailResponse,
  RecipeIngredient,
  RecipeStep,
} from '../../../lib/types';

type Stage =
  | 'detail'
  | 'cooking'
  | 'feedback'
  | 'done';

function durationText(
  seconds:
    number | null,
) {
  if (!seconds) {
    return null;
  }

  if (
    seconds < 60
  ) {
    return `${seconds} giây`;
  }

  const minutes =
    Math.round(
      seconds / 60,
    );

  return `${minutes} phút`;
}

function formatQuantity(
  value: number,
) {
  return Number.isInteger(
    value,
  )
    ? `${value}`
    : value
        .toFixed(3)
        .replace(
          /0+$/,
          '',
        )
        .replace(
          /\.$/,
          '',
        );
}

function TasteSlider(
  {
    label,
    left,
    right,
    value,
    onChange,
  }: {
    label: string;
    left: string;
    right: string;
    value: number;
    onChange:
      (value: number) => void;
  },
) {
  return (
    <div className="sliderRow">
      <div className="sliderHead">
        <span>
          {label}
        </span>

        <span>
          {value > 0
            ? `+${value}`
            : value}
        </span>
      </div>

      <input
        type="range"
        min="-1"
        max="1"
        step="0.25"
        value={value}
        onChange={
          (event) =>
            onChange(
              Number(
                event
                  .target
                  .value,
              ),
            )
        }
      />

      <div className="sliderLabels">
        <span>
          {left}
        </span>

        <span>
          Vừa
        </span>

        <span>
          {right}
        </span>
      </div>
    </div>
  );
}

export default function RecipePage() {
  const params =
    useParams<{
      slug: string;
    }>();

  const slug =
    params.slug;

  const [
    recipe,
    setRecipe,
  ] = useState<
    RecipeDetailResponse | null
  >(null);

  const [
    dev,
    setDev,
  ] = useState<
    DevBootstrapResponse | null
  >(null);

  const [
    personalized,
    setPersonalized,
  ] = useState<
    PersonalizedVersion | null
  >(null);

  const [
    session,
    setSession,
  ] = useState<
    CookSessionResponse | null
  >(null);

  const [
    stage,
    setStage,
  ] = useState<Stage>(
    'detail',
  );

  const [
    stepIndex,
    setStepIndex,
  ] = useState(0);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    overall,
    setOverall,
  ] = useState(4.5);

  const [
    saltiness,
    setSaltiness,
  ] = useState(0);

  const [
    garlicOnion,
    setGarlicOnion,
  ] = useState(0);

  const [
    softness,
    setSoftness,
  ] = useState(0);

  const [
    note,
    setNote,
  ] = useState('');

  useEffect(() => {
    let active =
      true;

    async function load() {
      try {
        const [
          recipeData,
          devData,
        ] =
          await Promise.all([
            apiRequest<
              RecipeDetailResponse
            >(
              `/recipes/${slug}`,
            ),

            apiRequest<
              DevBootstrapResponse
            >(
              '/dev/bootstrap',
            ),
          ]);

        if (!active) {
          return;
        }

        setRecipe(
          recipeData,
        );

        setDev(
          devData,
        );

        try {
          const latest =
            await apiRequest<
              PersonalizedResponse
            >(
              `/users/${devData.data.user.id}` +
              `/recipes/${slug}` +
              '/personalized-versions/latest',
            );

          if (active) {
            setPersonalized(
              latest.data,
            );
          }
        } catch (
          cause
        ) {
          if (
            !(
              cause instanceof
                ApiRequestError &&
              cause.status === 404
            )
          ) {
            throw cause;
          }
        }
      } catch (cause) {
        if (!active) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'Không tải được món ăn.',
        );
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [slug]);

  const cookingPersonalized =
    session?.data
      .recipe
      .source ===
    'personalized';

  const visibleIngredients =
    useMemo(() => {
      if (!recipe) {
        return [];
      }

      if (
        personalized
      ) {
        return personalized
          .snapshot
          .ingredients;
      }

      return recipe
        .data
        .version
        .ingredients;
    }, [
      personalized,
      recipe,
    ]);

  const activeSteps:
    RecipeStep[] =
    useMemo(() => {
      if (!recipe) {
        return [];
      }

      if (
        cookingPersonalized &&
        personalized
      ) {
        return personalized
          .snapshot
          .steps;
      }

      return recipe
        .data
        .version
        .steps;
    }, [
      cookingPersonalized,
      personalized,
      recipe,
    ]);

  async function ensurePersonalized() {
    if (
      !dev ||
      !recipe
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response =
        await apiRequest<
          PersonalizedResponse
        >(
          `/users/${dev.data.user.id}` +
          `/recipes/${recipe.data.slug}` +
          '/personalized-versions',
          {
            method:
              'POST',
          },
        );

      setPersonalized(
        response.data,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Không tạo được công thức cá nhân.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function startCooking(
    usePersonalized:
      boolean,
  ) {
    if (
      !dev ||
      !recipe
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result =
        await apiRequest<
          CookSessionResponse
        >(
          '/cook-sessions',
          {
            method:
              'POST',

            body:
              JSON.stringify({
                userId:
                  dev
                    .data
                    .user
                    .id,

                recipeSlug:
                  recipe
                    .data
                    .slug,

                servings:
                  personalized
                    ?.snapshot
                    .servings ??
                  recipe
                    .data
                    .version
                    .servings,

                personalizedRecipeVersionId:
                  usePersonalized
                    ? personalized
                        ?.id
                    : undefined,
              }),
          },
        );

      setSession(
        result,
      );

      setStepIndex(
        0,
      );

      setStage(
        'cooking',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Không bắt đầu được phiên nấu.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function completeCurrentStep() {
    if (!session) {
      return;
    }

    const step =
      activeSteps[
        stepIndex
      ];

    if (!step) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await apiRequest(
        `/cook-sessions/${session.data.id}/events`,
        {
          method:
            'POST',

          body:
            JSON.stringify({
              eventType:
                'step_completed',

              clientSeq:
                stepIndex +
                1,

              clientTime:
                new Date()
                  .toISOString(),

              payload: {
                stepNo:
                  step.stepNo,

                durationSeconds:
                  step
                    .durationSeconds,
              },
            }),
        },
      );

      if (
        stepIndex <
        activeSteps.length -
          1
      ) {
        setStepIndex(
          (
            current,
          ) =>
            current +
            1,
        );
      } else {
        const completed =
          await apiRequest<
            CookSessionResponse
          >(
            `/cook-sessions/${session.data.id}/complete`,
            {
              method:
                'POST',
            },
          );

        setSession(
          completed,
        );

        setStage(
          'feedback',
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Không lưu được tiến độ.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback() {
    if (
      !session ||
      !dev ||
      !recipe
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await apiRequest(
        `/cook-sessions/${session.data.id}/feedback`,
        {
          method:
            'POST',

          body:
            JSON.stringify({
              overallScore:
                overall,

              dimensions: {
                saltiness,
                garlic_onion:
                  garlicOnion,
                softness,
              },

              technicalFlags:
                [],

              privateNote:
                note ||
                undefined,
            }),
        },
      );

      const next =
        await apiRequest<
          PersonalizedResponse
        >(
          `/users/${dev.data.user.id}` +
          `/recipes/${recipe.data.slug}` +
          '/personalized-versions',
          {
            method:
              'POST',
          },
        );

      setPersonalized(
        next.data,
      );

      setStage(
        'done',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Không lưu được phản hồi.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (error && !recipe) {
    return (
      <main className="shell">
        <Link
          href="/"
          className="backLink"
        >
          ← Về Bếp Nhớ
        </Link>

        <div className="errorBox">
          {error}
        </div>
      </main>
    );
  }

  if (!recipe || !dev) {
    return (
      <main className="shell">
        <div className="loading">
          Đang chuẩn bị món ăn…
        </div>
      </main>
    );
  }

  const base =
    recipe.data.version;

  const displayVersion =
    personalized
      ? personalized
          .versionNo
      : base.versionNo;

  const currentStep =
    activeSteps[
      stepIndex
    ];

  if (
    stage ===
      'cooking' &&
    currentStep
  ) {
    const progress =
      (
        stepIndex /
        activeSteps.length
      ) *
      100;

    return (
      <main className="shell">
        <div className="cookShell">
          <div className="smallLabel">
            Cook Mode ·
            {' '}
            {session?.data
              .recipe
              .source ===
            'personalized'
              ? `Công thức cá nhân V${session.data.recipe.personalizedVersionNo}`
              : `Công thức chuẩn V${session?.data.recipe.versionNo}`}
          </div>

          <div className="progress">
            <div
              className="progressBar"
              style={{
                width:
                  `${progress}%`,
              }}
            />
          </div>

          <article className="cookCard">
            <span className="pill brand">
              Bước
              {' '}
              {stepIndex + 1}
              /
              {activeSteps.length}
            </span>

            <h1>
              {recipe.data.title}
            </h1>

            {durationText(
              currentStep
                .durationSeconds,
            ) && (
              <span className="timerLabel">
                Khoảng
                {' '}
                {
                  durationText(
                    currentStep
                      .durationSeconds,
                  )
                }
              </span>
            )}

            <div className="cookInstruction">
              {
                currentStep
                  .instruction
              }
            </div>

            {currentStep
              .tip && (
              <div className="successBox">
                <strong>
                  Mẹo nhỏ
                </strong>

                <div>
                  {
                    currentStep
                      .tip
                  }
                </div>
              </div>
            )}

            {error && (
              <div
                className="errorBox"
                style={{
                  marginTop:
                    18,
                }}
              >
                {error}
              </div>
            )}

            <div className="actions">
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={
                  () =>
                    void completeCurrentStep()
                }
              >
                {busy
                  ? 'Đang lưu…'
                  : stepIndex ===
                    activeSteps.length -
                      1
                    ? 'Hoàn thành món'
                    : 'Đã xong bước này'}
              </button>
            </div>
          </article>
        </div>
      </main>
    );
  }

  if (
    stage ===
    'feedback'
  ) {
    return (
      <main className="shell">
        <div className="cookShell">
          <article className="cookCard">
            <div className="smallLabel">
              Nấu xong rồi
            </div>

            <h1>
              Món hôm nay thế nào?
            </h1>

            <p>
              Phản hồi này sẽ được
              dùng để cập nhật Taste
              DNA và tạo công thức lần
              sau.
            </p>

            <div className="feedbackGrid">
              <div className="sliderRow">
                <div className="sliderHead">
                  <span>
                    Điểm tổng thể
                  </span>

                  <span>
                    {overall}/5
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.5"
                  value={overall}
                  onChange={
                    (
                      event,
                    ) =>
                      setOverall(
                        Number(
                          event
                            .target
                            .value,
                        ),
                      )
                  }
                />
              </div>

              <TasteSlider
                label="Độ mặn"
                left="Muốn nhạt hơn"
                right="Muốn đậm hơn"
                value={saltiness}
                onChange={
                  setSaltiness
                }
              />

              <TasteSlider
                label="Hành / tỏi"
                left="Ít hơn"
                right="Nhiều hơn"
                value={
                  garlicOnion
                }
                onChange={
                  setGarlicOnion
                }
              />

              <TasteSlider
                label="Độ mềm"
                left="Chắc hơn"
                right="Mềm hơn"
                value={softness}
                onChange={
                  setSoftness
                }
              />

              <div>
                <div
                  className="sliderHead"
                  style={{
                    marginBottom:
                      8,
                  }}
                >
                  Ghi chú riêng
                </div>

                <textarea
                  value={note}
                  placeholder="Ví dụ: lần sau muốn bớt mặn một chút…"
                  onChange={
                    (
                      event,
                    ) =>
                      setNote(
                        event
                          .target
                          .value,
                      )
                  }
                />
              </div>
            </div>

            {error && (
              <div
                className="errorBox"
                style={{
                  marginTop:
                    18,
                }}
              >
                {error}
              </div>
            )}

            <div className="actions">
              <button
                className="button green"
                type="button"
                disabled={busy}
                onClick={
                  () =>
                    void submitFeedback()
                }
              >
                {busy
                  ? 'Bếp Nhớ đang học…'
                  : 'Lưu khẩu vị của tôi'}
              </button>
            </div>
          </article>
        </div>
      </main>
    );
  }

  if (
    stage ===
    'done'
  ) {
    return (
      <main className="shell">
        <div className="cookShell">
          <article className="cookCard">
            <div className="smallLabel">
              Bếp Nhớ đã học thêm
            </div>

            <h1>
              Công thức V
              {
                personalized
                  ?.versionNo
              }
              {' '}
              đã sẵn sàng.
            </h1>

            <div className="successBox">
              Taste DNA đã được cập
              nhật từ lần nấu vừa rồi.

              {personalized &&
               personalized
                 .snapshot
                 .adjustments
                 .length >
                 0 && (
                <div className="adjustmentList">
                  {personalized
                    .snapshot
                    .adjustments
                    .map(
                      (
                        item,
                      ) => (
                        <div
                          key={
                            item
                              .ingredientSlug
                          }
                          className="adjustmentItem"
                        >
                          <span>
                            {
                              item
                                .ingredientName
                            }
                          </span>

                          <strong>
                            {
                              formatQuantity(
                                item
                                  .quantity,
                              )
                            }
                            {' '}
                            {
                              item
                                .unit
                            }
                            {' '}
                            (
                            {
                              item
                                .deltaPercent >
                              0
                                ? '+'
                                : ''
                            }
                            {
                              item
                                .deltaPercent
                            }
                            %)
                          </strong>
                        </div>
                      ),
                    )}
                </div>
              )}
            </div>

            <div className="actions">
              <button
                type="button"
                className="button"
                onClick={
                  () => {
                    setSession(
                      null,
                    );

                    setStepIndex(
                      0,
                    );

                    setStage(
                      'detail',
                    );
                  }
                }
              >
                Xem công thức mới
              </button>

              <Link
                href="/"
                className="button secondary"
              >
                Về danh sách món
              </Link>
            </div>
          </article>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <Link
        href="/"
        className="backLink"
      >
        ← Danh sách món
      </Link>

      <section className="detailHeader">
        <div>
          <div className="smallLabel">
            Món Việt ·
            {' '}
            {personalized
              ? 'Đã cá nhân hóa'
              : 'Công thức chuẩn'}
          </div>

          <h1>
            {recipe.data.title}
          </h1>

          <p>
            {personalized
              ?.snapshot
              .summary ??
              base.summary}
          </p>

          <div className="recipeMeta">
            <span className="pill personalized">
              {personalized
                ? `Dành cho bạn · V${displayVersion}`
                : `V${displayVersion}`}
            </span>

            <span className="pill">
              {
                personalized
                  ?.snapshot
                  .servings ??
                base.servings
              }
              {' '}
              phần
            </span>

            <span className="pill">
              {
                (
                  personalized
                    ?.snapshot
                    .prepTimeMinutes ??
                  base
                    .prepTimeMinutes ??
                  0
                ) +
                (
                  personalized
                    ?.snapshot
                    .cookTimeMinutes ??
                  base
                    .cookTimeMinutes ??
                  0
                )
              }
              {' '}
              phút
            </span>
          </div>

          <div className="actions">
            {personalized ? (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={
                  () =>
                    void startCooking(
                      true,
                    )
                }
              >
                Nấu phiên bản của tôi
              </button>
            ) : (
              <button
                type="button"
                className="button green"
                disabled={busy}
                onClick={
                  () =>
                    void ensurePersonalized()
                }
              >
                {busy
                  ? 'Đang cá nhân hóa…'
                  : 'Tạo công thức cho tôi'}
              </button>
            )}

            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={
                () =>
                  void startCooking(
                    false,
                  )
              }
            >
              Nấu công thức chuẩn
            </button>

            {personalized && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={
                  () =>
                    void ensurePersonalized()
                }
              >
                Làm mới theo Taste DNA
              </button>
            )}
          </div>

          {error && (
            <div
              className="errorBox"
              style={{
                marginTop:
                  18,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div>
          <div className="tasteCard">
            <div className="smallLabel">
              Taste DNA
            </div>

            <strong>
              {dev.data
                .tasteProfile
                ? `${Math.round(
                    dev.data
                      .tasteProfile
                      .maturityScore *
                      100,
                  )}%`
                : '—'}
            </strong>

            <p>
              {dev.data
                .tasteProfile
                ? `${dev.data.tasteProfile.sampleCount} lần nấu đã học`
                : 'Chưa có dữ liệu'}
            </p>
          </div>
        </div>
      </section>

      <div className="contentGrid">
        <section className="panel">
          <h2>
            Nguyên liệu
          </h2>

          <ul className="ingredientList">
            {visibleIngredients.map(
              (
                ingredient,
              ) => {
                const item =
                  ingredient as
                    RecipeIngredient & {
                      baseQuantity?:
                        number;

                      personalized?:
                        boolean;

                      deltaPercent?:
                        number;
                    };

                const quantity =
                  'baseQuantity'
                  in item
                    ? (
                        item as unknown as {
                          quantity:
                            number;
                        }
                      ).quantity
                    : item
                        .quantity;

                return (
                  <li
                    key={
                      item.id
                    }
                    className="ingredient"
                  >
                    <div>
                      <strong>
                        {
                          item.name
                        }
                      </strong>

                      {item.preparation && (
                        <div className="smallLabel">
                          {
                            item
                              .preparation
                          }
                        </div>
                      )}
                    </div>

                    <div
                      className={
                        item
                          .personalized
                          ? 'ingredientAmount adjusted'
                          : 'ingredientAmount'
                      }
                    >
                      {item
                        .personalized &&
                       item
                         .baseQuantity !==
                         undefined && (
                        <span className="baseAmount">
                          {
                            formatQuantity(
                              item
                                .baseQuantity,
                            )
                          }
                        </span>
                      )}

                      {
                        formatQuantity(
                          quantity,
                        )
                      }
                      {' '}
                      {item.unit}
                    </div>
                  </li>
                );
              },
            )}
          </ul>
        </section>

        <section className="panel">
          <h2>
            Các bước nấu
          </h2>

          <ol className="stepList">
            {(personalized
              ?.snapshot
              .steps ??
              base.steps
            ).map(
              (step) => (
                <li
                  key={
                    step.stepNo
                  }
                  className="stepItem"
                >
                  <span className="stepNumber">
                    {
                      step
                        .stepNo
                    }
                  </span>

                  <div>
                    <p>
                      {
                        step
                          .instruction
                      }
                    </p>

                    {step.tip && (
                      <div className="tip">
                        Mẹo:
                        {' '}
                        {
                          step
                            .tip
                        }
                      </div>
                    )}
                  </div>
                </li>
              ),
            )}
          </ol>
        </section>
      </div>

      <div className="footerNote">
        Công thức cá nhân hóa được tạo
        bằng deterministic Taste Engine
        và luôn giữ lại version đã nấu.
      </div>
    </main>
  );
}
