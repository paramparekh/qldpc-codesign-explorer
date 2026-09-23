import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";

export type ErrorModel = "manual_pauli" | "seeded_code_capacity";
export type ConfigurationPhase = "editing" | "confirmed";

export type ConfigurationState = {
  codeId: string | null;
  errorModel: ErrorModel;
  errorProbability: number;
  seed: number;
  phase: ConfigurationPhase;
};

type ConfigurationAction =
  | { type: "select-code"; codeId: string }
  | { type: "set-error-model"; errorModel: ErrorModel }
  | { type: "set-error-probability"; value: number }
  | { type: "set-seed"; value: number }
  | { type: "confirm" }
  | { type: "edit" };

const initialState: ConfigurationState = {
  codeId: null,
  errorModel: "manual_pauli",
  errorProbability: 0.05,
  seed: 1303,
  phase: "editing",
};

function reducer(state: ConfigurationState, action: ConfigurationAction): ConfigurationState {
  switch (action.type) {
    case "select-code":
      return { ...state, codeId: action.codeId, phase: "editing" };
    case "set-error-model":
      return { ...state, errorModel: action.errorModel, phase: "editing" };
    case "set-error-probability":
      return { ...state, errorProbability: action.value, phase: "editing" };
    case "set-seed":
      return { ...state, seed: action.value, phase: "editing" };
    case "confirm":
      return state.codeId ? { ...state, phase: "confirmed" } : state;
    case "edit":
      return { ...state, phase: "editing" };
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

