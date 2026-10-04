import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";

import type { CodeDetail } from "../api/codes";
import type { DecodeResult } from "../api/decoders";
import type { InjectionResult } from "../api/injections";
import type { ObservationResult } from "../api/observations";

export type ErrorModel = "manual_pauli" | "seeded_code_capacity";
export type ConfigurationPhase = "editing" | "confirmed";
export type ActiveStage = "configure" | "inject" | "observe" | "decode";
export type InjectionPhase = "draft" | "confirmed";
export type StoredInjection = InjectionResult & { phase: InjectionPhase };

export type ConfigurationState = {
  codeId: string | null;
  code: CodeDetail | null;
  errorModel: ErrorModel;
  errorProbability: number;
  seed: number;
  phase: ConfigurationPhase;
  activeStage: ActiveStage;
  injection: StoredInjection | null;
  observation: ObservationResult | null;
  decoding: DecodeResult | null;
};

type ConfigurationAction =
  | { type: "select-code"; code: CodeDetail }
  | { type: "set-error-model"; errorModel: ErrorModel }
  | { type: "set-error-probability"; value: number }
  | { type: "set-seed"; value: number }
  | { type: "confirm" }
  | { type: "edit" }
  | { type: "open-configure" }
  | { type: "open-inject" }
  | { type: "set-injection"; result: InjectionResult; phase: InjectionPhase }
  | { type: "edit-injection" }
  | { type: "confirm-injection" }
  | { type: "open-observe" }
  | { type: "set-observation"; result: ObservationResult }
  | { type: "open-decode" }
  | { type: "set-decoding"; result: DecodeResult };

const initialState: ConfigurationState = {
  codeId: null,
  code: null,
  errorModel: "manual_pauli",
  errorProbability: 0.05,
  seed: 1303,
  phase: "editing",
  activeStage: "configure",
  injection: null,
  observation: null,
  decoding: null,
};

function updateConfiguration(
  state: ConfigurationState,
  changes: Partial<ConfigurationState>,
): ConfigurationState {
  return {
    ...state,
    ...changes,
    phase: "editing",
    activeStage: "configure",
    injection: null,
    observation: null,
    decoding: null,
  };
}

function reducer(state: ConfigurationState, action: ConfigurationAction): ConfigurationState {
  switch (action.type) {
    case "select-code":
      if (state.codeId === action.code.id) return { ...state, code: action.code };
      return updateConfiguration(state, { codeId: action.code.id, code: action.code });
    case "set-error-model":
      return updateConfiguration(state, { errorModel: action.errorModel });
    case "set-error-probability":
      return updateConfiguration(state, { errorProbability: action.value });
    case "set-seed":
      return updateConfiguration(state, { seed: action.value });
    case "confirm":
      return state.codeId ? { ...state, phase: "confirmed" } : state;
    case "edit":
      return {
        ...state,
        phase: "editing",
        activeStage: "configure",
        injection: null,
        observation: null,
        decoding: null,
      };
    case "open-configure":
      return { ...state, activeStage: "configure" };
    case "open-inject":
      return state.phase === "confirmed" && state.code
        ? { ...state, activeStage: "inject" }
        : state;
    case "set-injection":
      return {
        ...state,
        injection: { ...action.result, phase: action.phase },
        observation: null,
        decoding: null,
      };
    case "edit-injection":
      return state.injection
        ? {
            ...state,
            injection: { ...state.injection, phase: "draft" },
            observation: null,
            decoding: null,
          }
        : state;
    case "confirm-injection":
      return state.injection
        ? { ...state, injection: { ...state.injection, phase: "confirmed" } }
        : state;
    case "open-observe":
      return state.injection?.phase === "confirmed"
        ? { ...state, activeStage: "observe" }
        : state;
    case "set-observation":
      return { ...state, observation: action.result, decoding: null };
    case "open-decode":
      return state.observation ? { ...state, activeStage: "decode" } : state;
    case "set-decoding":
      return { ...state, decoding: action.result };
  }
}

type ConfigurationContextValue = {
  state: ConfigurationState;
  dispatch: Dispatch<ConfigurationAction>;
};

const ConfigurationContext = createContext<ConfigurationContextValue | null>(null);

export function ConfigurationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <ConfigurationContext.Provider value={value}>{children}</ConfigurationContext.Provider>;
}

export function useConfiguration() {
  const context = useContext(ConfigurationContext);
  if (!context) throw new Error("useConfiguration must be used inside ConfigurationProvider.");
  return context;
}
