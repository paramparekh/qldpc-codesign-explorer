import { useEffect, useState } from "react";
import { getDecoders, type DecoderMetadata } from "../api/decoders";

export function useDecoders() {
  const [decoders, setDecoders] = useState<DecoderMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void getDecoders(controller.signal)
      .then(setDecoders)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load decoders.",
          );
      });
    return () => controller.abort();
  }, [attempt]);
  return { decoders, error, retry: () => setAttempt((value) => value + 1) };
}

export function DecoderSelect({
  label = "Decoder",
  value,
  onChange,
  decoders,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  decoders: DecoderMetadata[];
  disabled?: boolean;
}) {
  return (
    <label className="batch-field decoder-select">
      <span>{label}</span>
      <select
        disabled={disabled || !decoders.length}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!decoders.length && <option value={value}>Loading decoders…</option>}
        {decoders.map((decoder) => (
          <option key={decoder.id} value={decoder.id}>
            {decoder.name}
          </option>
        ))}
      </select>
    </label>
  );
}
