import type { Pauli } from "../api/injections";

type QubitPatternProps = {
  paulis: Pauli[];
  vertexPairCount: number;
  disabled?: boolean;
  activeTool?: Pauli;
  onSelect?: (index: number) => void;
};

function QubitSector({
  label,
  hint,
  start,
  values,
  disabled,
  activeTool,
  onSelect,
}: {
  label: string;
  hint: string;
  start: number;
  values: Pauli[];
  disabled: boolean;
  activeTool?: Pauli;
  onSelect?: (index: number) => void;
}) {
  return (
    <section className="qubit-sector" aria-label={label}>
      <div className="qubit-sector-heading">
        <h3>{label}</h3>
        <span>{hint}</span>
      </div>
      <ol className="qubit-grid" start={start + 1}>
        {values.map((pauli, offset) => {
          const index = start + offset;
          const qubitNumber = index + 1;
          const action = activeTool === "I" ? "erase the error" : `apply ${activeTool}`;
          return (
            <li key={qubitNumber}>
              {onSelect ? (
                <button
                  aria-label={`Qubit ${qubitNumber}, currently ${pauli}; ${action}`}
                  className={`qubit-cell pauli-${pauli.toLowerCase()}`}
                  disabled={disabled}
                  onClick={() => onSelect(index)}
                  type="button"
                >
                  <span>Q{qubitNumber}</span>
                  <strong>{pauli}</strong>
                </button>
              ) : (
                <div
                  aria-label={`Qubit ${qubitNumber}: ${pauli}`}
                  className={`qubit-cell pauli-${pauli.toLowerCase()}`}
                >
                  <span>Q{qubitNumber}</span>
                  <strong>{pauli}</strong>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function QubitPattern({
  paulis,
  vertexPairCount,
  disabled = false,
  activeTool,
  onSelect,
}: QubitPatternProps) {
  const firstRange = `Qubits 1-${vertexPairCount}`;
  const secondRange = `Qubits ${vertexPairCount + 1}-${paulis.length}`;

  return (
    <div className="qubit-map">
      <QubitSector
        activeTool={activeTool}
        disabled={disabled}
        hint={firstRange}
        label="Qubit group A"
        onSelect={onSelect}
        start={0}
        values={paulis.slice(0, vertexPairCount)}
      />
      <QubitSector
        activeTool={activeTool}
        disabled={disabled}
        hint={secondRange}
        label="Qubit group B"
        onSelect={onSelect}
        start={vertexPairCount}
        values={paulis.slice(vertexPairCount)}
      />
    </div>
  );
}
