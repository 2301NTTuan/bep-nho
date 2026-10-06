# ADR-0002: Deterministic Taste Engine core

LLM must not directly decide persisted quantitative taste state. Taste updates and recipe adjustments use deterministic, versioned rules with bounded changes. LLM may explain structured outcomes through AI Gateway.
